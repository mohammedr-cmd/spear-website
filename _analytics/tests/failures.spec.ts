import { expect, test } from "@playwright/test";
import { open } from "./checks";

// Mo, 25 Nov 2026: no loading state spins forever (5 seconds, then the offline screen or a named
// error), Spear unreachable switches the whole page to the offline screen, and every failure
// names its reason in the page's language.
for (const lang of ["en", "ar"] as const) {
  test.describe(`failures are named (${lang})`, () => {
    test("a request that never answers gives up after 5 seconds with a named reason", async ({ page }) => {
      await page.route("**/api/dashboard*", () => {
        /* never answered */
      });
      await open(page, "/", lang);
      const t0 = Date.now();
      await expect(page.locator(".card.refused")).toBeVisible({ timeout: 9000 });
      expect(Date.now() - t0).toBeLessThan(9000);
      await expect(page.locator(".card.refused")).toContainText(lang === "ar" ? "5 ثوانٍ" : "5 seconds");
    });

    test("Spear unreachable: the whole page is the offline screen", async ({ page }) => {
      await open(page, "/compare", lang);
      await page.waitForSelector("table.stmt tbody tr");
      await page.route("**/api/**", (r) => r.fulfill({ status: 502, contentType: "text/plain", body: "unreachable" }));
      await page.locator(".chips").nth(1).locator("button").last().click();
      await expect(page.locator(".offline")).toBeVisible({ timeout: 9000 });
      await expect(page.locator(".card.refused")).toHaveCount(0);
    });

    test("request limit reached is said as such, in the page's language", async ({ page }) => {
      await page.route("**/api/tools/get_financials", (r) =>
        r.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: "rate_limited", message: "Too many requests." }),
        }),
      );
      await open(page, "/statements/1010", lang);
      await expect(page.locator(".card.refused")).toContainText(lang === "ar" ? "حد الطلبات" : "Request limit reached");
    });

    test("not allowed is said as such", async ({ page }) => {
      await page.route("**/api/tools/get_prices", (r) =>
        r.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "forbidden", message: "x" }) }),
      );
      await open(page, "/market", lang);
      await expect(page.locator(".card.refused").first()).toContainText(lang === "ar" ? "غير مسموح" : "Not allowed");
    });

    test("a failure inside one panel stays in that panel; the header, menu and other panels work", async ({ page }) => {
      // a response with a shape the sectors panel can't read
      await page.route("**/api/dashboard*", async (r) => {
        const res = await r.fetch();
        const body = await res.json();
        body.sahmk_sectors = { label: "x", as_of: null, groups: "not a list", unrecorded: 0 };
        await r.fulfill({ response: res, json: body });
      });
      await open(page, "/", lang);
      await expect(page.locator(".card.refused")).toHaveCount(1);
      await expect(page.locator(".header .nav")).toBeVisible();
      await expect(page.locator(".counts")).toBeVisible();
      await expect(page.locator("table.banks")).toBeVisible();
      await expect(page.locator(".offline")).toHaveCount(0);
    });
  });
}
