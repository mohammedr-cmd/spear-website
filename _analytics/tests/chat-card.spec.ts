import { expect, test, type Page } from "@playwright/test";
import { open, untranslated } from "./checks";

// Mo, 26 Nov 2026: a figure's marker never stands beside a digit (an Arabic "1,254,690" with its
// marker read as "11,254,690"), in either direction, on the figure cards or in the sentence. The
// chat API is answered in the browser (no model); the figure is a real one from the tool layer.

async function realFact(page: Page) {
  return page.evaluate(async () => {
    const c = await (await fetch("/api/auth/csrf", { credentials: "include" })).json();
    const r = await fetch("/api/tools/get_financials", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": c.csrf },
      body: JSON.stringify({ symbol: "1180", statement: "BS" }),
    });
    return (await r.json()).data.find((x: any) => x.line_item_code === "total_assets");
  });
}

// every marker: no digit within 6px beside it on the same line
async function markersBesideDigits(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const m of Array.from(document.querySelectorAll(".chat-card .fig-n"))) {
      const mr = m.getBoundingClientRect();
      const scope = m.closest(".fig-card, .answer-text") ?? document.body;
      const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const n = w.currentNode as Text;
        if (m.contains(n)) continue;
        const s = n.textContent ?? "";
        for (let i = 0; i < s.length; i++) {
          if (!/[0-9٠-٩]/.test(s[i])) continue;
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + 1);
          for (const g of Array.from(r.getClientRects())) {
            const sameLine = Math.min(g.bottom, mr.bottom) - Math.max(g.top, mr.top) > 2;
            const gap = Math.max(mr.left - g.right, g.left - mr.right);
            if (sameLine && gap < 6) bad.push(`marker ${m.textContent} beside "${s.slice(Math.max(0, i - 6), i + 6)}"`);
          }
        }
      }
    }
    return bad;
  });
}

for (const lang of ["en", "ar"] as const) {
  test(`chat card (${lang}): markers clear of digits, no bracket in the sentence, names in the card's language`, async ({ page }) => {
    await open(page, "/chat", lang);
    await page.waitForSelector(".chat-off");
    const fin = await realFact(page);
    const ar = lang === "ar";
    const cite = ar ? `${fin.document}، صفحة ${fin.page}` : `${fin.document}, page ${fin.page}`;
    const amount = ar ? "1,254,690 ألف ريال" : "SAR 1,254,690 thousand";
    const what = ar ? "البنك الأهلي السعودي (1180)، إجمالي الموجودات، كما في 30 سبتمبر 2026" : "Saudi National Bank (1180), Total assets, as at 30 September 2026";
    const fig = `${amount} (${what}${ar ? "؛" : ";"} ${cite})`;
    const cover = ar ? "1 من 1 بنوك" : "1 of 1 banks";
    const q = ar ? "ما إجمالي موجودات البنك الأهلي السعودي كما في 30 سبتمبر 2026؟" : "What were SNB's total assets at 30 September 2026?";
    const lead = ar ? "بلغت " : "They were ";
    const mid = ar ? "، وفق التغطية " : ", covering ";
    const card = {
      kind: "answer",
      reason: null,
      lang,
      text: `${lead}${fig}${mid}${cover}.`,
      segments: [
        { text: lead },
        { text: fig, ref: `F${fin.fact_id}`, n: 1 },
        { text: mid },
        { text: cover, ref: "K1", n: 2 },
        { text: "." },
      ],
      figures: [
        { n: 1, ref: `F${fin.fact_id}`, type: "fact", text: fig, cells: [fin] },
        { n: 2, ref: "K1", type: "coverage", text: cover, cells: [] },
      ],
      notes: [],
    };
    await page.route("**/api/chat/status", (r) => r.fulfill({ json: { on: true, state: "on", why: null, switch: true, can_switch_on: true } }));
    await page.route("**/api/chat/ask", (r) =>
      r.fulfill({ status: 202, json: { id: "c1", status: "done", question: q, steps: ["question", "scope", "statement", "checking"], seconds: 3, card } }),
    );
    await page.reload();
    await page.waitForSelector(".askbar input:not([disabled])");
    await page.fill(".askbar input", q);
    await page.click(".askbar button[type=submit]");
    await page.waitForSelector(".chat-card .fig-card");
    expect(await markersBesideDigits(page)).toEqual([]);
    // the sentence has the amount and its source chip, with no bracket: the company, line item
    // and period are on the figure's card (Mo, 27 Nov 2026)
    const sentence = (await page.locator(".chat-card .answer-text").innerText()).replace(/\s+/g, " ");
    expect(sentence).toContain(amount);
    expect(sentence).not.toContain(what);
    expect(sentence).not.toContain("(");
    await expect(page.locator(".chat-card .fig-inline > .src-chip")).toHaveCount(1);
    await expect(page.locator(".chat-card .fig-card").first()).toContainText(what);
    if (ar) expect(await untranslated(page)).toEqual([]);
  });
}
