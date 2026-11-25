import { defineConfig } from "@playwright/test";

// Browser tests of the rendered app, against the local development stack: the API on Mo's PC
// (`spear web serve`, SPEAR_WEB_DEV=1) and `npm run dev`. They read no data from this repository
// and write none to it. See tests/README.md.
export default defineConfig({
  testDir: "tests",
  globalSetup: "./tests/sign-in.ts",
  workers: 1, // the API allows 120 tool calls a minute
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.SPEAR_APP_URL ?? "http://localhost:5173",
    storageState: "tests/.auth/owner.json",
    trace: "off",
    actionTimeout: 10_000, // a click that can't happen fails fast, never waits out the test
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: false } },
  ],
});
