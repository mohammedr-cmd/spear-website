import { expect, test, type Page } from "@playwright/test";
import { open, untranslated } from "./checks";

// Conversations (27 Nov 2026): a message after the first is sent with the id of the conversation's
// last question (`follows`), so the server reads it as a follow-up. A greeting gets the welcome
// card, whose examples can be clicked. "Earlier questions" lists one entry per conversation, which
// shows that conversation again when clicked. The chat API is answered in the browser (no model).

const Q1 = "What was Riyad Bank's net income for 2025?";
const Q1b = "and in 2024?";
const Q2 = "What were Alinma Bank's total assets at 30 September 2026?";
const EXAMPLE = "What were Banque Saudi Fransi's total assets at 30 September 2026?";
const clarify = (text: string) => ({ kind: "clarify", reason: "scope_not_stated", lang: "en", text });
const WELCOME_EN = {
  kind: "welcome",
  reason: null,
  lang: "en",
  text: "",
  intro: "Spear answers questions on the Saudi banks' financial statements: signed-off figures from each bank's own statements, each with its source page.",
  try: "Try:",
  examples: [EXAMPLE],
  footer: "Spear doesn't answer questions on share prices, dividends or yields: see the Market page.",
};
const WELCOME_AR = {
  ...WELCOME_EN,
  lang: "ar",
  intro: "يجيب رمح عن أسئلة القوائم المالية للبنوك السعودية: أرقام معتمدة من قوائم كل بنك، مع صفحة المصدر لكل رقم.",
  try: "جرّب:",
  examples: ["ما إجمالي الموجودات للبنك السعودي الفرنسي كما في 30 سبتمبر 2026؟"],
  footer: "لا يجيب رمح عن أسعار الأسهم أو التوزيعات أو العوائد: راجع صفحة السوق.",
};

// every ask is answered at once with a card that names its question, and its body is kept
async function chatOn(page: Page, lang: "en" | "ar") {
  const sent: any[] = [];
  await page.route("**/api/health", (r) => r.fulfill({ json: { ok: true, service: "spear-analytics" } }));
  await page.route("**/api/chat/status", (r) => r.fulfill({ json: { on: true, state: "on", why: null, switch: true, can_switch_on: true } }));
  await page.route("**/api/chat/ask", (r) => {
    const body = r.request().postDataJSON();
    sent.push(body);
    const id = `job${sent.length}`;
    const q: string = body.question;
    const card = /^(hello|مرحبا)$/.test(q) ? (/[؀-ۿ]/.test(q) ? WELCOME_AR : WELCOME_EN) : clarify(`Card for: ${q}`);
    return r.fulfill({ status: 202, json: { id, status: "done", question: q, steps: ["question"], seconds: 1, card } });
  });
  await open(page, "/chat", lang);
  await page.waitForSelector(".askbar input:not([disabled])");
  return sent;
}

async function ask(page: Page, q: string) {
  const n = await page.locator(".exchange").count();
  await page.fill(".askbar input", q);
  await page.click(".askbar button[type=submit]");
  await expect(page.locator(".exchange")).toHaveCount(n + 1);
  await page.waitForSelector(".exchange:last-child .answer");
}

// the panel: a side column on a desktop, a drawer on a phone
async function panel(page: Page) {
  const opener = page.locator(".drawer-open");
  if (await opener.isVisible()) await opener.click();
  return page.locator(".history");
}

for (const lang of ["en", "ar"] as const) {
  const ar = lang === "ar";
  test.describe(`chat conversations (${lang})`, () => {
    test("a follow-up is sent with the conversation's last question, and the panel shows one entry", async ({ page }) => {
      const sent = await chatOn(page, lang);
      await ask(page, Q1);
      await ask(page, Q1b);
      expect(sent[0].follows).toBeUndefined();
      expect(sent[1]).toEqual({ question: Q1b, follows: "job1" });
      const h = await panel(page);
      await expect(h.locator(".past-q")).toHaveCount(1);
      await expect(h.locator(".past-q").first()).toContainText(Q1);
      await expect(h.locator(".past-q").first()).toContainText(ar ? "+1 متابعة" : "+1 follow-up");
      if (ar) expect(await untranslated(page)).toEqual([]);
    });

    test("a new question starts a new conversation; an earlier one opens its cards when clicked", async ({ page }) => {
      const sent = await chatOn(page, lang);
      await ask(page, Q1);
      await ask(page, Q1b);
      let h = await panel(page);
      await h.locator(".new-q").click();
      await expect(page.locator(".exchange")).toHaveCount(0);
      await ask(page, Q2);
      expect(sent[2].follows).toBeUndefined(); // a new conversation reads alone
      h = await panel(page);
      await expect(h.locator(".past-q")).toHaveCount(2);
      await expect(h.locator(".past-q").first()).toContainText(Q2); // newest first
      await h.locator(".past-q", { hasText: Q1 }).click();
      await expect(page.locator(".exchange")).toHaveCount(2);
      await expect(page.locator(".exchange").nth(0)).toContainText(`Card for: ${Q1}`);
      await expect(page.locator(".exchange").nth(1)).toContainText(`Card for: ${Q1b}`);
      // asking here goes on with that conversation
      await ask(page, "and total assets?");
      expect(sent[3]).toEqual({ question: "and total assets?", follows: "job2" });
    });

    test("a greeting gets the welcome card, and an example asks itself as a follow-up", async ({ page }) => {
      const sent = await chatOn(page, lang);
      await ask(page, ar ? "مرحبا" : "hello");
      const card = page.locator(".exchange:last-child .welcome-card");
      await expect(card).toContainText(ar ? "يجيب رمح" : "Spear answers questions");
      await expect(card).toContainText(ar ? "راجع صفحة السوق" : "see the Market page");
      const example = card.locator(".example-q").first();
      const text = (await example.textContent()) ?? "";
      await example.click();
      await expect(page.locator(".exchange")).toHaveCount(2);
      expect(sent[1]).toEqual({ question: text, follows: "job1" });
      if (ar) expect(await untranslated(page)).toEqual([]);
    });

    // Mo, 27 Nov 2026: each question must survive a page reload. Where the history is stored
    // (the server per account, or the browser) is Mo's decision, not yet made: until then the
    // panel is kept in the page only, and this test is expected to fail.
    test.fixme("two questions, a reload, and both are in the panel", async ({ page }) => {
      await chatOn(page, lang);
      await ask(page, Q1);
      let h = await panel(page);
      await h.locator(".new-q").click();
      await ask(page, Q2);
      await page.reload();
      await page.waitForSelector(".askbar input:not([disabled])");
      h = await panel(page);
      await expect(h.locator(".past-q", { hasText: Q1 })).toHaveCount(1);
      await expect(h.locator(".past-q", { hasText: Q2 })).toHaveCount(1);
    });
  });
}
