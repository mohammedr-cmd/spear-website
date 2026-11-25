// Generates src/styles/tokens.css from brand/tokens.json at build time (SPEC 11b), so a token
// change in the Spear design system flows through. Never edit tokens.css by hand.
import { readFileSync, writeFileSync } from "node:fs";

const t = JSON.parse(readFileSync(new URL("../brand/tokens.json", import.meta.url), "utf8"));
const light = [];
const dark = [];
for (const c of t.color.tokens) {
  light.push(`  --${c.name}: ${c.value.light};`);
  dark.push(`  --${c.name}: ${c.value.dark};`);
}
const rest = [];
for (const [k, v] of Object.entries(t.type.families)) rest.push(`  --font-${k}: ${v};`);
for (const g of t.type.groups)
  for (const s of g.styles) {
    rest.push(`  --${s.name}-size: ${s.fontSize};`);
    rest.push(`  --${s.name}-line: ${s.lineHeight};`);
    rest.push(`  --${s.name}-weight: ${s.fontWeight};`);
    if (s.letterSpacing) rest.push(`  --${s.name}-tracking: ${s.letterSpacing};`);
  }
for (const s of t.spacing.tokens) rest.push(`  --${s.name}: ${s.value};`);
for (const r of t.radius.tokens) rest.push(`  --${r.name}: ${r.value};`);
const faces = t.type.fonts
  .map(
    (f) =>
      `@font-face { font-family: "${f.family}"; src: url("/${f.file}") format("woff2"); font-weight: ${f.weight}; font-style: normal; font-display: swap; }`,
  )
  .join("\n");

const css = `/* Generated from brand/tokens.json by scripts/tokens.mjs. Do not edit. */
${faces}
:root {
${light.join("\n")}
${rest.join("\n")}
}
:root[data-theme="ink"] {
${dark.join("\n")}
}
`;
writeFileSync(new URL("../src/styles/tokens.css", import.meta.url), css);
console.log(`tokens.css: ${t.color.tokens.length} colours, ${t.type.fonts.length} font files`);
