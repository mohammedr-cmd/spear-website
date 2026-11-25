import { expect, test } from "@playwright/test";
import { lowContrast, open, pause } from "./checks";

// Mo, 25 Nov 2026: the logo (and nothing else) is ever ink on ink. Every page, both themes, both
// languages: the logo reaches 3:1 against its ground, and so does every text and the chart line.
const pages: [string, string][] = [
  ["dashboard", "/"],
  ["statements", "/statements/1010"],
  ["compare", "/compare"],
  ["market", "/market"],
  ["chat", "/chat"],
];

for (const theme of ["paper", "ink"] as const) {
  for (const lang of ["en", "ar"] as const) {
    test.describe(`${theme} theme, ${lang}`, () => {
      for (const [name, path] of pages) {
        test(name, async ({ page }) => {
          await open(page, path, lang, theme);
          await page.waitForSelector("main .panel, main .chat-off, main .counts");
          await pause(page, 2500);
          expect(await lowContrast(page)).toEqual([]);
        });
      }

      test("sign-in", async ({ browser }) => {
        const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        const page = await ctx.newPage();
        await open(page, "/", lang, theme);
        await page.waitForSelector("#email");
        expect(await lowContrast(page)).toEqual([]);
        await ctx.close();
      });

      test("offline", async ({ page }) => {
        await page.route("**/api/**", (r) => r.fulfill({ status: 502, contentType: "text/plain", body: "" }));
        await open(page, "/", lang, theme);
        await page.waitForSelector(".offline");
        expect(await lowContrast(page)).toEqual([]);
      });
    });
  }
}
