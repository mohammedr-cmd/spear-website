// Writes dist/_headers (Cloudflare Pages) after the build: a strict Content-Security-Policy that
// allows only this site and the API, no third-party scripts, fonts or frames. Fonts also allow
// data: URLs, and only fonts: Thmanyah is embedded as data: URLs inside the compiled CSS
// (src/styles/thmanyah.css, per its licence), and 'self' alone blocked it (Mo, 26 Nov 2026).
import { writeFileSync } from "node:fs";

const api = new URL(process.env.SPEAR_API_URL ?? "https://analytics-api.rumh.co").origin;
const csp = [
  "default-src 'self'",
  `connect-src 'self' ${api}`,
  `img-src 'self' ${api} data: blob:`,
  "font-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const headers = `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY
`;
writeFileSync(new URL("../dist/_headers", import.meta.url), headers);
writeFileSync(new URL("../dist/_redirects", import.meta.url), "/* /index.html 200\n");
console.log(`_headers: API ${api}`);
