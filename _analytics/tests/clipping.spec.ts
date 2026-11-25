import { expect, test, type Page } from "@playwright/test";
import { clipped, open, pause } from "./checks";

// Mo, 25 Nov 2026: no figure ever renders in part, at desktop and phone width, left to right and
// right to left; and the newest period is the first column beside the item column, on load.
async function everyPage(page: Page) {
  const problems: string[] = [];
  problems.push(...(await clipped(page)));
  const next = page.locator(".pager button").nth(1);
  for (let i = 0; i < 12 && (await next.count()) && (await next.isEnabled()); i++) {
    await next.click();
    problems.push(...(await clipped(page)));
  }
  return problems;
}

const years = async (page: Page) =>
  (await page.locator("table.stmt thead th[data-fig]").allInnerTexts()).map((t) => Number(/\d{4}/.exec(t)?.[0] ?? 0));

for (const lang of ["en", "ar"] as const) {
  test.describe(`no figure is cut (${lang})`, () => {
    for (const stmt of [0, 1]) {
      test(`statements, ${stmt ? "income statement" : "balance sheet"}`, async ({ page }) => {
        await open(page, "/statements/1010", lang);
        await page.waitForSelector("td.cell-btn button");
        if (stmt) {
          await page.locator(".seg button").nth(1).click();
          await page.waitForSelector("td.cell-btn button");
        }
        const y = await years(page);
        expect(y[0], "the newest period comes first").toBe(Math.max(...y));
        expect(await everyPage(page)).toEqual([]);
        // with a figure's source panel open, the table narrows and still cuts nothing
        await page.locator("td.cell-btn button").first().click();
        await page.waitForSelector(".source-panel");
        await page.waitForTimeout(300); // the columns are recounted for the narrower box
        expect(await clipped(page)).toEqual([]);
        await pause(page);
      });
    }

    test("compare, with the total column", async ({ page }) => {
      await open(page, "/compare", lang);
      await page.waitForSelector("table.stmt tbody tr");
      await page.locator("input[type=checkbox]").check();
      await expect(page.locator(".updating-label")).toHaveCount(0);
      expect(await everyPage(page)).toEqual([]);
      await pause(page);
    });

    test("dashboard", async ({ page }) => {
      await open(page, "/", lang);
      await page.waitForSelector(".counts");
      expect(await clipped(page)).toEqual([]);
    });
  });
}
