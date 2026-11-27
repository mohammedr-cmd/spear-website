import { expect, test, type Page } from "@playwright/test";
import { open, untranslated } from "./checks";

// Mo, 27 Nov 2026: "Chat is temporarily unavailable" is for the model's host only. Every other
// failure gets its own message, and when the page gives up waiting for a card it tells the server
// why. The live failure of 27 Nov was the first: the token the page fetched before signing in,
// refused after it. The chat API is answered in the browser (no model).

const Q = "What was Riyad Bank's net income for 2025?";
const CARD = { kind: "not_answered", reason: "not_in_data", lang: "en", text: "Not answered: not in Spear's data." };

async function chatOn(page: Page, lang: "en" | "ar") {
  // these reload the page often; /health is answered here so the API's limit (60 a minute) isn't
  // reached and taken for "Spear is offline" (the chat API is answered here anyway)
  await page.route("**/api/health", (r) => r.fulfill({ json: { ok: true, service: "spear-analytics" } }));
  await page.route("**/api/chat/status", (r) => r.fulfill({ json: { on: true, state: "on", why: null, switch: true, can_switch_on: true } }));
  await open(page, "/chat", lang);
  await page.waitForSelector(".askbar input:not([disabled])");
}

async function askIt(page: Page) {
  await page.fill(".askbar input", Q);
  await page.click(".askbar button[type=submit]");
  await page.waitForSelector(".exchange:last-child .chat-unavailable, .exchange:last-child .chat-card, .exchange:last-child .answer-slot");
}

const failure = (page: Page) => page.locator(".exchange:last-child .chat-unavailable");

for (const lang of ["en", "ar"] as const) {
  const ar = lang === "ar";
  test.describe(`chat failures are named (${lang})`, () => {
    for (const [what, refusal] of [
      ["the server's JSON csrf error", { status: 403, json: { error: "csrf", message: "The page's security token was out of date. Try again." } }],
      ["Django's own HTML 403 page (the server before 27 Nov)", { status: 403, contentType: "text/html", body: "<!DOCTYPE html><title>403 Forbidden</title><h1>CSRF verification failed.</h1>" }],
    ] as const) {
      test(`one CSRF refusal (${what}) is sent again with a fresh token, and the answer comes`, async ({ page }) => {
        let asks = 0;
        const sent: string[] = [];
        await page.route("**/api/chat/ask", (r) => {
          asks += 1;
          sent.push(r.request().headers()["x-csrftoken"] ?? "");
          if (asks === 1) return r.fulfill(refusal);
          return r.fulfill({ status: 202, json: { id: "j1", status: "done", question: Q, steps: ["question"], seconds: 1, card: CARD } });
        });
        await chatOn(page, lang);
        await askIt(page);
        await page.waitForSelector(".exchange:last-child .answer-slot"); // the card, no failure
        await expect(failure(page)).toHaveCount(0);
        expect(asks).toBe(2);
        expect(sent[0] && sent[1] && sent[0] !== sent[1]).toBe(true); // sent again with a fresh token
      });
    }

    test("refused twice: the security-check message, not \"temporarily unavailable\", and Try again asks again", async ({ page }) => {
      let asks = 0;
      await page.route("**/api/chat/ask", (r) => {
        asks += 1;
        if (asks <= 2) return r.fulfill({ status: 403, json: { error: "csrf", message: "The page's security token was out of date. Try again." } });
        return r.fulfill({ status: 202, json: { id: "j1", status: "done", question: Q, steps: ["question"], seconds: 1, card: CARD } });
      });
      await chatOn(page, lang);
      await askIt(page);
      expect(asks).toBe(2); // once, then once more with a fresh token
      await expect(failure(page)).toHaveAttribute("data-failure", "csrf");
      await expect(failure(page)).toContainText(ar ? "تعذّر التحقق الأمني" : "Spear's security check failed");
      await expect(failure(page)).not.toContainText(ar ? "غير متاحة مؤقتًا" : "temporarily unavailable");
      if (ar) expect(await untranslated(page)).toEqual([]);
      await failure(page).locator("button").click();
      await page.waitForSelector(".exchange:last-child .answer-slot");
      expect(asks).toBe(3);
    });

    test("a question lost in a restart: its own message, and the page reports why it gave up", async ({ page }) => {
      const reports: any[] = [];
      await page.route("**/api/chat/ask", (r) => r.fulfill({ status: 202, json: { id: "j2", status: "running", question: Q, steps: ["question"], seconds: 0 } }));
      await page.route("**/api/chat/jobs/j2", (r) => r.fulfill({ status: 404, json: { error: "not_found", message: "That question is no longer here. Ask it again." } }));
      await page.route("**/api/chat/jobs/j2/gave-up", (r) => {
        reports.push(r.request().postDataJSON());
        return r.fulfill({ json: { logged: true } });
      });
      await chatOn(page, lang);
      await askIt(page);
      await expect(failure(page)).toHaveAttribute("data-failure", "lost");
      await expect(failure(page)).toContainText(ar ? "فُقد هذا السؤال" : "This question was lost");
      await expect.poll(() => reports.length).toBe(1);
      expect(reports[0]).toMatchObject({ why: "lost", last_status: 404 });
      if (ar) expect(await untranslated(page)).toEqual([]);
    });

    test("three failed polls: a server error, reported with the polls and the last status", async ({ page }) => {
      const reports: any[] = [];
      await page.route("**/api/chat/ask", (r) => r.fulfill({ status: 202, json: { id: "j3", status: "running", question: Q, steps: ["question"], seconds: 0 } }));
      await page.route("**/api/chat/jobs/j3", (r) => r.fulfill({ status: 500, json: { error: "server_error", message: "Spear's server had an error. It has been logged." } }));
      await page.route("**/api/chat/jobs/j3/gave-up", (r) => {
        reports.push(r.request().postDataJSON());
        return r.fulfill({ json: { logged: true } });
      });
      await chatOn(page, lang);
      await askIt(page);
      await expect(failure(page)).toHaveAttribute("data-failure", "server");
      await expect(failure(page)).toContainText(ar ? "حدث خطأ في خادم رمح" : "Spear's server had an error");
      await expect.poll(() => reports.length).toBe(1);
      expect(reports[0]).toMatchObject({ why: "poll_failed", failed_polls: 3, last_status: 500 });
    });

    for (const [status, body, kind, en, arText, retry] of [
      [409, { error: "busy", message: "The last question is still being answered." }, "busy", "still being answered", "ما زال سؤالك السابق", true],
      [429, { error: "rate_limited", message: "Too many requests." }, "rate_limited", "Too many questions in a minute", "أسئلة كثيرة خلال دقيقة", true],
      [403, { error: "chat_off", message: "switched_off" }, "off", "Chat has been switched off", "أُوقفت المحادثة", false],
      [500, { error: "server_error", message: "Spear's server had an error. It has been logged." }, "server", "Spear's server had an error", "حدث خطأ في خادم رمح", true],
    ] as const) {
      test(`ask refused with ${status} ${body.error}: "${kind}", not "temporarily unavailable"`, async ({ page }) => {
        await page.route("**/api/chat/ask", (r) => r.fulfill({ status, json: body }));
        await chatOn(page, lang);
        await askIt(page);
        await expect(failure(page)).toHaveAttribute("data-failure", kind);
        await expect(failure(page)).toContainText(ar ? arText : en);
        await expect(failure(page).locator("button")).toHaveCount(retry ? 1 : 0);
      });
    }

    test("the model's host unavailable still says so, with a retry", async ({ page }) => {
      await page.route("**/api/chat/ask", (r) =>
        r.fulfill({ status: 202, json: { id: "j4", status: "done", question: Q, steps: ["question"], seconds: 1, card: { kind: "not_answered", reason: "host_unavailable", lang, text: "" } } }),
      );
      await chatOn(page, lang);
      await askIt(page);
      await expect(failure(page)).toHaveAttribute("data-failure", "host");
      await expect(failure(page)).toContainText(ar ? "المحادثة غير متاحة مؤقتًا" : "Chat is temporarily unavailable, please try again");
      await expect(failure(page).locator("button")).toHaveCount(1);
    });
  });
}
