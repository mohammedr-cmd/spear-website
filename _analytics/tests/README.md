# Browser tests

They check the rendered app (Mo, 25 Nov 2026):

- `translation.spec.ts`: no untranslated tool string on an Arabic page.
- `clipping.spec.ts`: no figure is cut in part, at desktop and phone width, left to right and right to left. The newest period comes first.
- `failures.spec.ts`: a request that never answers gives up after 5 seconds with a named reason, Spear unreachable shows the offline screen, and limits and refusals are named in the page's language.
- `controls.spec.ts`: every control on Compare, Statements, Market and Chat changes the page or says why not. A failed request shows "Not answered".
- `chat-failures.spec.ts` (Mo, 27 Nov 2026): only the model's host shows "Chat is temporarily unavailable". Every other failure has its own message, and a question the page gave up on is reported to the server. A request refused by the CSRF check is sent once more with a fresh token.
- `csrf-sign-in.spec.ts`: signs in through the real form, with Django's CSRF check on as in a browser, and makes a change first: a chat question, then a statement and sign-out. The other tests start from a saved session and a fresh page load, so they never see the token that signing in replaces. These run at desktop width only, spaced out, because the API allows 5 sign-ins a minute.

They run against the local development stack, because the data never leaves Mo's PC:

1. Start the API: `spear web serve --port 8787` with `SPEAR_WEB_DEV=1` (see docs/runbook.md in Spear Analytics).
2. Start the app: `npm run dev` in this folder.
3. Run the tests: `SPEAR_WEB_DIR=<the API's folder> npm run test:ui`.

They use the Chromium build Playwright has already installed on that PC, so they download nothing.
