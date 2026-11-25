import { chromium, type FullConfig } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Signs in once as the development owner and keeps the session for every test. The accounts and
// the emailed sign-in code come from the development API's own folder (SPEAR_WEB_DIR), never from
// this repository.
export default async function signIn(config: FullConfig) {
  const dir = process.env.SPEAR_WEB_DIR;
  if (!dir || !existsSync(join(dir, "dev-accounts.json"))) {
    throw new Error("Set SPEAR_WEB_DIR to the development API's folder (it holds dev-accounts.json and dev-mail).");
  }
  const accounts = JSON.parse(readFileSync(join(dir, "dev-accounts.json"), "utf-8"));
  const email = Object.keys(accounts).find((e) => e.startsWith("dev-owner"))!;
  const base = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(base + "/");
  await page.fill("#email", email);
  await page.fill("#password", accounts[email]);
  const t0 = Date.now();
  await page.click("button[type=submit]");
  await page.waitForSelector("#code");
  let code: string | null = null;
  for (let i = 0; i < 40 && !code; i++) {
    const mail = join(dir, "dev-mail");
    for (const f of readdirSync(mail)) {
      const p = join(mail, f);
      if (statSync(p).mtimeMs < t0 - 1000) continue;
      const m = /code is (\d{6})/.exec(readFileSync(p, "utf-8"));
      if (m) code = m[1];
    }
    if (!code) await page.waitForTimeout(500);
  }
  if (!code) throw new Error("No sign-in code arrived in the development mail folder.");
  await page.fill("#code", code);
  await page.click("button[type=submit]");
  await page.waitForSelector(".counts", { timeout: 30_000 });
  mkdirSync("tests/.auth", { recursive: true });
  await page.context().storageState({ path: "tests/.auth/owner.json" });
  await browser.close();
}
