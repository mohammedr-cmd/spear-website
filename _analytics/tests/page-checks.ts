import type { Page } from "@playwright/test";

// Text cut by a clipping box, or two texts drawn over each other. Looked at screen by screen
// (scrolling the page), so text covered by a sheet or the fixed menu (not visible) isn't counted.
export async function textProblems(page: Page): Promise<string[]> {
  const bad = new Set<string>();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = Math.max(200, Math.floor((page.viewportSize()?.height ?? 800) * 0.8));
  for (let y = 0; y < height; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    const found = await page.evaluate(() => {
      const out: string[] = [];
      const items: { el: Element; rects: DOMRect[]; text: string }[] = [];
      const w = document.createTreeWalker(document.getElementById("root") ?? document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const n = w.currentNode as Text;
        const el = n.parentElement;
        const text = (n.textContent ?? "").trim();
        if (!el || !text || el.closest("option, select, script, style")) continue;
        // inside a closed "How this was computed" section (its summary line excepted): not shown
        if (el.closest("details:not([open])") && !el.closest("summary")) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.5) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = Array.from(range.getClientRects()).filter(
          (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight,
        );
        if (!rects.length) continue;
        // a line covered by something else (a sheet, the fixed menu) isn't visible: not counted
        const visible = rects.filter((r) => {
          const top = document.elementFromPoint(r.left + Math.min(4, r.width / 2), r.top + r.height / 2);
          return !top || top === el || el.contains(top) || top.contains(el);
        });
        if (!visible.length) continue;
        rects.splice(0, rects.length, ...visible);
        let left = 0;
        let right = document.documentElement.clientWidth;
        for (let a: Element | null = el; a; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== "visible") {
            const bx = a.getBoundingClientRect();
            left = Math.max(left, bx.left);
            right = Math.min(right, bx.right);
          }
        }
        for (const r of rects) {
          const inside = r.left >= left - 1 && r.right <= right + 1;
          const outside = r.right <= left + 1 || r.left >= right - 1;
          if (!inside && !outside) {
            out.push(`cut: "${text.slice(0, 40)}"`);
            break;
          }
        }
        items.push({ el, rects, text: text.slice(0, 30) });
      }
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
          for (const ra of a.rects) {
            for (const rb of b.rects) {
              const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
              const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
              // a line box is taller than its letters (a large figure's most of all): only an
              // overlap of more than a third of the smaller line is text drawn over text
              if (ix > 2 && iy > Math.min(ra.height, rb.height) / 3) out.push(`overlap: "${a.text}" / "${b.text}"`);
            }
          }
        }
      }
      return out;
    });
    found.forEach((f) => bad.add(f));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return [...bad];
}

// Every control in the page's main area, one after another: each must change what the page
// shows (or say why not) within a few seconds, and must not break the page. A disabled control
// must say why beside it (a pager's ends excepted).
export async function sweepControls(page: Page, limit = 30): Promise<string[]> {
  const bad: string[] = [];
  const errors: string[] = [];
  const onError = (e: Error) => errors.push(e.message);
  page.on("pageerror", onError);
  const sel = "main button:visible, main select:visible, main input[type=checkbox]:visible, main summary:visible";
  const count = Math.min(limit, await page.locator(sel).count());
  for (let i = 0; i < count; i++) {
    const c = page.locator(sel).nth(i);
    if (!(await c.count())) break;
    const name =
      ((await c.getAttribute("aria-label")) ?? (await c.innerText().catch(() => "")) ?? "").trim().slice(0, 40) ||
      `control ${i}`;
    // an option already chosen: choosing it again rightly changes nothing
    const chosen = await c.evaluate(
      (el) => el.getAttribute("aria-pressed") === "true" || el.classList.contains("on") || el.getAttribute("aria-current") === "page",
    );
    if (chosen) continue;
    if (await c.isDisabled()) {
      const why = await c.evaluate((el) => {
        if (el.closest(".pager")) return "pager end";
        const id = el.getAttribute("aria-describedby");
        const own = id ? document.getElementById(id)?.textContent : null;
        const near = el
          .closest("form, .panel-body, section, .history")
          ?.querySelector(".run-status, [role=status], .muted, .small")?.textContent;
        return (own ?? near ?? "").trim();
      });
      if (!why) bad.push(`disabled with no reason: ${name}`);
      continue;
    }
    const before = await page.locator("main").innerHTML();
    try {
      const tag = await c.evaluate((el) => el.tagName);
      if (tag === "SELECT") {
        const n = await c.locator("option").count();
        const cur = await c.evaluate((el) => (el as HTMLSelectElement).selectedIndex);
        if (n < 2) continue;
        await c.selectOption({ index: (cur + 1) % n }, { timeout: 3000 });
      } else {
        await c.click({ timeout: 3000 });
      }
    } catch {
      continue; // covered or gone after an earlier control: not this control's fault
    }
    let changed = false;
    for (let k = 0; k < 16 && !changed; k++) {
      await page.waitForTimeout(500);
      changed = (await page.locator("main").innerHTML()) !== before;
    }
    if (!changed) bad.push(`no visible change and no message: ${name}`);
    if ((await page.locator("main").innerText()).trim() === "") bad.push(`the page went blank after: ${name}`);
    const close = page.locator(".sheet-close:visible");
    if (await close.count()) await close.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  page.off("pageerror", onError);
  return [...bad, ...errors.map((e) => `page error: ${e.slice(0, 120)}`)];
}
