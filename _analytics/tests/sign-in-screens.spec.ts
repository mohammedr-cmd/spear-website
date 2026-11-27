import { expect, test } from "@playwright/test";
import { open } from "./checks";

// The signed-out screens (27 Nov 2026): on a phone the sign-in form is on the first screen, the
// header keeps "Analytics" beside the logo, and the invitation and password-reset pages lead back
// to sign-in. Desktop and phone, both languages; 320px wide too.
test.use({ storageState: { cookies: [], origins: [] } });

const LABEL = { en: "Analytics", ar: "التحليلات" };
const BACK = { en: "Back to sign in", ar: "العودة إلى تسجيل الدخول" };

for (const lang of ["en", "ar"] as const) {
  test.describe(`signed-out screens (${lang})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.route("**/api/health", (r) => r.fulfill({ json: { ok: true, service: "spear-analytics" } }));
      await page.route("**/api/auth/invite/info*", (r) => r.fulfill({ json: { display_name: null } }));
    });

    for (const width of [null, 320] as const) {
      test(`sign-in: the form on the first screen, "Analytics" in the header${width ? ` (${width}px)` : ""}`, async ({ page }) => {
        if (width) await page.setViewportSize({ width, height: 640 });
        await open(page, "/", lang);
        await page.waitForSelector(".public form");
        const vh = page.viewportSize()!.height;
        const submit = await page.locator(".public form button[type=submit]").boundingBox();
        expect(submit!.y + submit!.height).toBeLessThanOrEqual(vh);
        await expect(page.locator(".public-head .lockup .eyebrow")).toBeVisible();
        await expect(page.locator(".public-head .lockup .eyebrow")).toHaveText(LABEL[lang]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      });
    }

    for (const path of ["/invite#a-token", "/invite", "/reset#uid=1&token=x"]) {
      test(`${path.split("#")[0]}${path.includes("#") ? " with a token" : ""} leads back to sign-in`, async ({ page }) => {
        await open(page, path, lang);
        await page.waitForSelector(".public form");
        const back = page.locator(".public form .links a", { hasText: BACK[lang] });
        await expect(back).toBeVisible();
        await back.click();
        await page.waitForSelector(".public form #email");
      });
    }
  });
}
