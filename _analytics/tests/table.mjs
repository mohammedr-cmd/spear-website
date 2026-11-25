// The visual pass as a table: one row per page, one column per combination (Mo, 25 Nov 2026).
// Reads Playwright's JSON report: PLAYWRIGHT_JSON_OUTPUT_NAME=tests/results.json.
import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync(new URL("./results.json", import.meta.url), "utf-8"));
const cells = new Map();
const walk = (suite, path) => {
  for (const s of suite.suites ?? []) walk(s, [...path, s.title]);
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) {
      const combo = `${path.at(-1)} · ${t.projectName}`;
      const r = t.results.at(-1);
      const msg = (r?.error?.message ?? "").replace(/\u001b\[[0-9;]*m/g, "");
      const n = (msg.match(/^\s*\+\s+"/gm) ?? []).length;
      cells.set(`${spec.title}|${combo}`, r?.status === "passed" ? "pass" : `FAIL${n ? ` (${n})` : ""}`);
    }
  }
};
for (const s of report.suites) walk(s, [s.title]);
const combos = [...new Set([...cells.keys()].map((k) => k.split("|")[1]))].sort();
const rows = [...new Set([...cells.keys()].map((k) => k.split("|")[0]))];
console.log(`| Page | ${combos.join(" | ")} |`);
console.log(`|---|${combos.map(() => "---").join("|")}|`);
for (const r of rows) console.log(`| ${r} | ${combos.map((c) => cells.get(`${r}|${c}`) ?? "").join(" | ")} |`);
