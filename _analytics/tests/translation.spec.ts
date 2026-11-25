import { expect, test } from "@playwright/test";
import { open, pause, untranslated } from "./checks";

// Mo, 25 Nov 2026: an Arabic page never shows an untranslated tool string. Every page, with its
// source panel, workings and totals open.
test.describe("Arabic pages show no untranslated tool string", () => {
  test("dashboard", async ({ page }) => {
    await open(page, "/", "ar");
    await page.waitForSelector(".counts");
    await page.waitForSelector(".spark");
    expect(await untranslated(page)).toEqual([]);
  });

  for (const stmt of [0, 1]) {
    test(`statements, ${stmt ? "income statement" : "balance sheet"}, with a figure's source`, async ({ page }) => {
      await open(page, "/statements/1010", "ar");
      await page.waitForSelector("td.cell-btn button");
      if (stmt) {
        await page.locator(".seg button").nth(1).click();
        await page.waitForSelector("td.cell-btn button");
      }
      expect(await untranslated(page)).toEqual([]);
      // a figure with a note, if the table shows one; otherwise the first figure
      const tagged = page.locator("td.cell-btn button:has(.tag)");
      await ((await tagged.count()) ? tagged.first() : page.locator("td.cell-btn button").first()).click();
      await page.waitForSelector(".source-panel img", { timeout: 60_000 });
      expect(await untranslated(page)).toEqual([]);
      await pause(page);
    });
  }

  test("compare, with the total column", async ({ page }) => {
    await open(page, "/compare", "ar");
    await page.waitForSelector("table.stmt tbody tr");
    await page.locator("input[type=checkbox]").check();
    await expect(page.locator("table.stmt thead")).toContainText("المجموع");
    await expect(page.locator(".updating-label")).toHaveCount(0);
    expect(await untranslated(page)).toEqual([]);
    await pause(page);
  });

  test("market, every working open", async ({ page }) => {
    await open(page, "/market", "ar");
    await page.waitForSelector(".pchart-hit");
    await pause(page, 3000);
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => d.setAttribute("open", "")));
    expect(await untranslated(page)).toEqual([]);
    await pause(page);
  });

  test("chat, switched off", async ({ page }) => {
    await open(page, "/chat", "ar");
    await page.waitForSelector(".chat-off");
    expect(await untranslated(page)).toEqual([]);
  });
});
