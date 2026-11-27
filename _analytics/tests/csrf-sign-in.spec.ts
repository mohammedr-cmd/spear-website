import { expect, test, type Page, type Response } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Mo, 27 Nov 2026: signing in replaces the CSRF token (Django), and the page kept the one it had
// fetched before, so the first change after the emailed code was refused (403) and chat showed
// "temporarily unavailable". The other tests start from a saved session and a fresh page load, so
// they always had the new token and never saw this. These sign in through the real form against
// the development API, with Django's CSRF check on as in a browser, and make a change first.
// /chat/status is answered in the browser (chat on), so no model is called: the question reaches
// the real API and gets past the CSRF check (the development switch is off: "chat_off").
test.use({ storageState: { cookies: [], origins: [] } });
// once, at desktop width (the fault isn't about width), and spaced out: the API allows 5 sign-ins a
// minute from one address, and the shared sign-in before the tests is one of them
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the sign-in flow is the same at every width");
  await page.waitForTimeout(13_000);
});

async function signInThroughTheForm(page: Page) {
  const dir = process.env.SPEAR_WEB_DIR!;
  const accounts = JSON.parse(readFileSync(join(dir, "dev-accounts.json"), "utf-8"));
  const email = Object.keys(accounts).find((e) => e.startsWith("dev-owner"))!;
  await page.goto("/");
  await page.fill("#email", email);
  await page.fill("#password", accounts[email]);
  const t0 = Date.now();
  await page.click("button[type=submit]");
  await page.waitForSelector("#code");
  let code: string | null = null;
  for (let i = 0; i < 40 && !code; i++) {
    for (const f of readdirSync(join(dir, "dev-mail"))) {
      const p = join(dir, "dev-mail", f);
      if (statSync(p).mtimeMs < t0 - 1000) continue;
      const m = /code is (\d{6})/.exec(readFileSync(p, "utf-8"));
      if (m) code = m[1];
    }
    if (!code) await page.waitForTimeout(500);
  }
  expect(code, "a sign-in code in the development mail folder").toBeTruthy();
  await page.fill("#code", code!);
  await page.click("button[type=submit]");
  await page.waitForSelector(".counts", { timeout: 30_000 });
}

// every POST and how it ended; a CSRF refusal is a 403 with the "csrf" error or Django's HTML page
function watchPosts(page: Page) {
  const posts: { path: string; status: number; csrf: boolean }[] = [];
  page.on("response", async (r: Response) => {
    if (r.request().method() !== "POST" || !r.url().includes("/api/")) return;
    let csrf = false;
    if (r.status() === 403) {
      const type = r.headers()["content-type"] ?? "";
      csrf = !type.includes("application/json") || (await r.json().catch(() => ({}))).error === "csrf";
    }
    posts.push({ path: new URL(r.url()).pathname.replace(/^\/api/, ""), status: r.status(), csrf });
  });
  return posts;
}

test("signed in through the form, a chat question first: past the CSRF check, sent once", async ({ page }) => {
  const posts = watchPosts(page);
  await page.route("**/api/chat/status", (r) => r.fulfill({ json: { on: true, state: "on", why: null, switch: true, can_switch_on: true } }));
  await signInThroughTheForm(page);
  await page.click("nav a[href='/chat']"); // within the app: no reload
  await page.waitForSelector(".askbar input:not([disabled])");
  await page.fill(".askbar input", "What was Riyad Bank's net income for 2025?");
  await page.click(".askbar button[type=submit]");
  await page.waitForSelector(".exchange:last-child .chat-unavailable, .exchange:last-child .answer-slot, .exchange:last-child .chat-card");
  const asks = posts.filter((p) => p.path === "/chat/ask");
  expect(asks).toHaveLength(1); // no refusal, so no second send
  expect(asks[0].csrf).toBe(false);
  expect([202, 403]).toContain(asks[0].status); // 403 here is "chat_off" (the development switch)
  await expect(page.locator("[data-failure=csrf]")).toHaveCount(0);
  expect(posts.filter((p) => p.csrf)).toEqual([]);
});

test("signed in through the form, a statement first, then sign out: no POST refused", async ({ page }) => {
  const posts = watchPosts(page);
  await signInThroughTheForm(page);
  await page.click("nav a[href='/statements']"); // its tables are POSTs to /tools/<name>
  await page.waitForSelector("table.stmt tbody tr", { timeout: 60_000 });
  const tools = posts.filter((p) => p.path.startsWith("/tools/"));
  expect(tools.length).toBeGreaterThan(0);
  expect(tools.every((p) => p.status === 200)).toBe(true);
  await page.getByRole("button", { name: /^Sign out$|^تسجيل الخروج$/ }).click();
  await page.waitForSelector("#email");
  const out = posts.filter((p) => p.path === "/auth/logout");
  expect(out).toHaveLength(1);
  expect(out[0].status).toBe(200);
  expect(posts.filter((p) => p.csrf)).toEqual([]);
});
