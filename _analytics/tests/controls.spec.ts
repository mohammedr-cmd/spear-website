import { expect, test } from "@playwright/test";
import { open, pause, reacts } from "./checks";

// Mo, 25 Nov 2026: every control gives visible feedback; a failed request shows "Not answered"
// with the reason, never nothing.
for (const lang of ["en", "ar"] as const) {
  test.describe(`controls answer (${lang})`, () => {
    test("compare: every control changes the page, and the table refreshes at once", async ({ page }) => {
      await open(page, "/compare", lang);
      await page.waitForSelector("table.stmt tbody tr");
      const compareCall = () => page.waitForRequest((r) => r.url().includes("/tools/compare"), { timeout: 8000 });

      await reacts(page, "sector menu", () => page.selectOption("#sector", { index: 0 }));
      await page.waitForSelector("table.stmt tbody tr");
      await reacts(page, "search and add", async () => {
        await page.fill("#company-search", "1180");
        await page.locator(".results button").first().click();
      });
      await reacts(page, "remove a chip", () => page.locator(".picker .chips .pick.on").first().click());
      const steps: [string, () => Promise<unknown>][] = [
        ["period menu", () => page.selectOption("#pe", { index: 1 })],
        ["months menu", () => page.selectOption("#months", "12")],
        ["item button", () => page.locator(".chips").nth(1).locator("button").last().click()],
        ["ratio button", () => page.locator(".chips").nth(2).locator("button").last().click()],
        ["total checkbox", () => page.locator("input[type=checkbox]").click()],
      ];
      for (const [name, act] of steps) {
        const call = compareCall();
        await reacts(page, name, act);
        await call; // the table refreshes without a separate button
        await expect(page.locator(".updating-label")).toHaveCount(0);
        await pause(page, 800);
      }

      // too few companies: the page says why, and asks nothing
      while ((await page.locator(".picker .chips .pick.on").count()) > 1) {
        await page.locator(".picker .chips .pick.on").first().click();
      }
      await expect(page.locator(".run-status.blocked")).toBeVisible();

      // a failed request: "Not answered" with the reason
      // a failure Spear itself reports (a reachable Spear, a failing tool)
      await page.route("**/api/tools/compare", (r) =>
        r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "tool_error", message: "x" }) }),
      );
      // add companies not already chosen until the comparison runs
      for (const q of ["1180", "1150", "1140"]) {
        if (!(await page.locator(".run-status.blocked").isVisible())) break;
        await page.fill("#company-search", q);
        const add = page.locator(".results button:not(.on)").first();
        if (await add.count()) await add.click();
      }
      await expect(page.locator(".card.refused")).toBeVisible();
      await page.unroute("**/api/tools/compare");
    });

    test("statements: statement switch, company search, figure, pages, close", async ({ page }) => {
      await open(page, "/statements/1010", lang);
      await page.waitForSelector("td.cell-btn button");
      await reacts(page, "income statement", () => page.locator(".seg button").nth(1).click());
      await page.waitForSelector("td.cell-btn button");
      await reacts(page, "company search", async () => {
        await page.fill("#company-search", "1180");
        await page.locator(".results button").first().click();
      });
      await page.waitForSelector("td.cell-btn button");
      const next = page.locator(".pager button").nth(1);
      if ((await next.count()) && (await next.isEnabled())) await reacts(page, "next periods", () => next.click());
      await reacts(page, "choose a figure", () => page.locator("td.cell-btn button").first().click());
      await expect(page.locator(".source-panel")).toBeVisible();
      await reacts(page, "close the source", () => page.locator(".source-panel .sheet-close").click());
      await expect(page.locator(".source-panel")).toHaveCount(0);
      await pause(page);
    });

    test("market: symbol search and workings", async ({ page }) => {
      await open(page, "/market", lang);
      await page.waitForSelector(".pchart-hit");
      await expect(page.locator("h1.title")).toContainText(lang === "ar" ? "تاسي" : "TASI"); // a fresh visit opens on TASI
      await reacts(page, "search suggestions", () => page.locator(".page-head form input").fill("1120"));
      await expect(page.locator(".results.suggest button").first()).toBeVisible();
      await reacts(page, "choose a company", () => page.locator(".results.suggest button").filter({ hasText: "1120" }).first().click());
      await expect(page.locator("h1.title")).toContainText("1120");
      await expect(page.locator("text=" + (lang === "ar" ? "عائد التوزيعات" : "Dividend yield")).first()).toBeVisible();
      await reacts(page, "back to TASI", () => page.locator(".page-head .linklike").click());
      // an index has no dividends: no dividend or yield card
      await expect(page.locator("text=" + (lang === "ar" ? "عائد التوزيعات" : "Dividend yield"))).toHaveCount(0);
      await page.waitForSelector(".pchart-hit");
      await pause(page, 3000);
      for (const d of await page.locator("details.working summary").all()) await reacts(page, "working", () => d.click());
      await pause(page);
    });

    test("chat: off says why; asked, it shows each step, then Spear's figures with source chips", async ({ page }) => {
      await open(page, "/chat", lang);
      await page.waitForSelector(".chat-off");
      await expect(page.locator(".askbar input")).toBeDisabled();
      await expect(page.locator(".new-q")).toBeDisabled();
      await expect(page.locator("#ask-why")).not.toBeEmpty();

      // chat switched on, answered in the browser (no model): a real figure from the tool layer
      const fin = await page.evaluate(async () => {
        const c = await (await fetch("/api/auth/csrf", { credentials: "include" })).json();
        const r = await fetch("/api/tools/get_financials", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRFToken": c.csrf },
          body: JSON.stringify({ symbol: "1180", statement: "BS" }),
        });
        return (await r.json()).data.find((x: any) => x.line_item_code === "total_assets");
      });
      const ar = lang === "ar";
      const cite = ar ? `${fin.document}، صفحة ${fin.page}` : `${fin.document}, page ${fin.page}`;
      const fig = `${ar ? "1 ألف ريال" : "SAR 1 thousand"} (${ar ? "البنك الأهلي السعودي (1180)" : "Saudi National Bank (1180)"}; ${cite})`;
      const q = ar ? "ما إجمالي موجودات البنك الأهلي السعودي كما في 30 سبتمبر 2026؟" : "What were SNB's total assets at 30 September 2026?";
      const card = {
        kind: "answer",
        reason: null,
        lang,
        text: `${ar ? "بلغت" : "They were"} ${fig}.`,
        segments: [{ text: ar ? "بلغت " : "They were " }, { text: fig, ref: `F${fin.fact_id}`, n: 1 }, { text: "." }],
        figures: [{ n: 1, ref: `F${fin.fact_id}`, type: "fact", text: fig, cells: [fin] }],
        notes: [],
        read_as: {
          companies: [{ symbol: "1180", name_en: "Saudi National Bank", name_ar: "البنك الأهلي السعودي" }],
          sector: null,
          periods: [{ period_end: "2026-09-30", months: null, en: "as at 30 September 2026", ar: "كما في 30 سبتمبر 2026" }],
          unstated: [],
        },
      };
      let polls = 0;
      let fail = false;
      await page.route("**/api/chat/status", (r) => r.fulfill({ json: { on: true, state: "on", why: null, switch: true, can_switch_on: true } }));
      await page.route("**/api/chat/ask", (r) =>
        r.fulfill({ status: 202, json: { id: "j1", status: "running", question: q, steps: ["question"], seconds: 0 } }),
      );
      await page.route("**/api/chat/jobs/j1", (r) => {
        polls += 1;
        if (fail) return r.fulfill({ status: 200, json: { id: "j1", status: "done", question: q, steps: ["question"], seconds: 1, card: { kind: "not_answered", reason: "host_unavailable", lang, text: "" } } });
        if (polls < 3) return r.fulfill({ json: { id: "j1", status: "running", question: q, steps: ["question", "scope", "statement"], seconds: polls } });
        return r.fulfill({ json: { id: "j1", status: "done", question: q, steps: ["question", "scope", "statement", "checking"], seconds: 4, card } });
      });
      await page.reload();
      await page.waitForSelector(".askbar input:not([disabled])");
      await page.fill(".askbar input", q);
      await reacts(page, "ask", () => page.click(".askbar button[type=submit]"));
      await page.waitForSelector(".chat-progress li.done"); // the steps, not a blank spinner
      await page.waitForSelector(".chat-card .fig-card");
      await expect(page.locator(".chat-card .read-as")).toContainText(ar ? "البنك الأهلي السعودي (1180)" : "Saudi National Bank (1180)");
      await expect(page.locator(".chat-card .fig-inline .src-chip")).toHaveCount(1); // the citation is a chip
      await reacts(page, "source chip", () => page.locator(".fig-card .src-chip").first().click());
      await page.waitForSelector(".chat-source .source-panel img", { timeout: 60000 });
      await reacts(page, "close the source", () => page.locator(".chat-source .sheet-close").click());
      // the host unavailable: the message at once, with a retry that asks again
      fail = true;
      await page.fill(".askbar input", q);
      await reacts(page, "ask again", () => page.click(".askbar button[type=submit]"));
      await page.waitForSelector(".chat-unavailable");
      await expect(page.locator(".chat-unavailable")).toContainText(ar ? "المحادثة غير متاحة مؤقتًا" : "Chat is temporarily unavailable, please try again");
      fail = false;
      polls = 0;
      await reacts(page, "try again", () => page.locator(".chat-unavailable button").last().click());
      await page.waitForSelector(".exchange:last-child .chat-card");
      const drawer = page.locator(".drawer-open");
      if (await drawer.isVisible()) {
        await reacts(page, "earlier questions", () => drawer.click());
        await reacts(page, "close the drawer", () => page.locator(".drawer-close").click());
        await reacts(page, "earlier questions again", () => drawer.click()); // "New question" is in the drawer
      }
      await reacts(page, "new question", () => page.locator(".new-q").click());
      await pause(page);
    });
  });
}
