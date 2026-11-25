import { expect, test, type Page } from "@playwright/test";
import { lowContrast, open, pause, untranslated } from "./checks";
import { sweepControls, textProblems } from "./page-checks";

// Mo, 25 Nov 2026: every page in all eight combinations (English and Arabic, Paper and Ink,
// desktop and phone: the two projects). Fails on contrast below 3:1, text cut or drawn over other
// text, an untranslated string on an Arabic page, a control that changes nothing and says
// nothing, or a page error. `node tests/table.mjs` turns the run into the result table.
const pages: { name: string; path: string; ready: string; session?: Record<string, string> }[] = [
  { name: "Dashboard", path: "/", ready: ".counts" },
  { name: "Statements", path: "/statements/1010", ready: "td.cell-btn button" },
  { name: "Compare", path: "/compare", ready: "table.stmt tbody tr" },
  { name: "Market", path: "/market", ready: ".pchart-hit" },
  // a company, with its dividends and yield (the session remembers the last one viewed)
  { name: "Market, company", path: "/market", ready: ".pchart-hit", session: { "spear.market": "1180" } },
  { name: "Chat", path: "/chat", ready: ".chat-off" },
];

async function check(page: Page, lang: "en" | "ar", controls: boolean) {
  const problems: string[] = [];
  problems.push(...(await lowContrast(page)).map((p) => `contrast ${p}`));
  problems.push(...(await textProblems(page)));
  if (lang === "ar") problems.push(...(await untranslated(page)).map((p) => `untranslated "${p}"`));
  if (controls) problems.push(...(await sweepControls(page)));
  return problems;
}

for (const theme of ["paper", "ink"] as const) {
  for (const lang of ["en", "ar"] as const) {
    test.describe(`${theme} · ${lang}`, () => {
      for (const p of pages) {
        test(p.name, async ({ page }) => {
          if (p.session) await page.addInitScript((kv) => Object.entries(kv).forEach(([k, v]) => sessionStorage.setItem(k, v)), p.session);
          await open(page, p.path, lang, theme);
          await page.waitForSelector(p.ready, { timeout: 30_000 });
          await pause(page, 2000);
          expect(await check(page, lang, true)).toEqual([]);
          await pause(page);
        });
      }

      // the total checkbox once blanked the page: with every company served, with some missing,
      // and with one company chosen
      test("Compare total", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await open(page, "/compare", lang, theme);
        await page.waitForSelector("table.stmt tbody tr");
        await page.locator("input[type=checkbox]").check();
        await expect(page.locator(".total-scope").first()).toBeVisible();
        await expect(page.locator(".updating-label")).toHaveCount(0);
        const counts = await page.locator(".total-scope").allInnerTexts();
        expect(counts.length).toBeGreaterThan(0);
        for (const c of counts) expect(c).toMatch(lang === "ar" ? /\d+ من \d+ شركات/ : /\d+ of \d+ companies/);
        // some missing: add a company with no figure for the newest period
        await page.fill("#company-search", "1120");
        await page.locator(".results button").first().click();
        await expect(page.locator(".updating-label")).toHaveCount(0);
        await expect(page.locator(".missing-once")).toBeVisible();
        // one company: the page says why, keeps its controls and doesn't go blank
        while ((await page.locator(".picker .chips .pick.on").count()) > 1) await page.locator(".picker .chips .pick.on").first().click();
        await expect(page.locator(".run-status.blocked")).toBeVisible();
        await page.locator("input[type=checkbox]").click();
        await page.locator("input[type=checkbox]").click();
        expect((await page.locator("main").innerText()).trim()).not.toBe("");
        expect(errors).toEqual([]);
        await pause(page);
      });

      test("Sign-in", async ({ browser }) => {
        const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        const page = await ctx.newPage();
        await open(page, "/", lang, theme);
        await page.waitForSelector("#email");
        expect(await check(page, lang, false)).toEqual([]);
        await ctx.close();
      });

      test("Offline", async ({ page }) => {
        await page.route("**/api/**", (r) => r.fulfill({ status: 502, contentType: "text/plain", body: "" }));
        await open(page, "/", lang, theme);
        await page.waitForSelector(".offline");
        expect(await check(page, lang, false)).toEqual([]);
      });
    });
  }
}
