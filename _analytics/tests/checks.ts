import { expect, type Page } from "@playwright/test";

export async function open(page: Page, path: string, lang: "en" | "ar", theme: "paper" | "ink" = "paper") {
  await page.addInitScript(
    ([l, th]) => {
      try {
        localStorage.setItem("spear.lang", l);
        localStorage.setItem("spear.theme", th);
      } catch {
        /* storage may be unavailable */
      }
    },
    [lang, theme] as const,
  );
  await page.goto(path);
}

// Tool text that bypasses the reader translation: any visible run of Latin letters on an Arabic
// page, except inside an English original the reader asked for (.orig-text) or an element marked
// data-allow-en (the language switch; an English question and its English answer).
export async function untranslated(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    const root = document.getElementById("root") ?? document.body;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode as Text;
      const el = n.parentElement;
      const text = (n.textContent ?? "").replace(/\b(PDF|ISIN|SAMA|TASI|NOMU)\b/g, "");
      if (!el || !/[A-Za-z]{3,}/.test(text)) continue;
      if (el.closest("[data-allow-en], .orig-text, option")) continue;
      if (el.closest("details:not([open])") && !el.closest("summary")) continue; // not shown
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === "hidden" || cs.display === "none") continue;
      bad.push((n.textContent ?? "").trim().slice(0, 140));
    }
    return bad;
  });
}

// A figure (or its tag) shown only in part. Its visible area is its box cut by every ancestor
// that clips (overflow other than visible) and by the window: a figure wholly inside it is
// shown, one wholly outside is not shown (allowed), one across its edge is cut (a failure).
export async function clipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("table .num, table .tag"))) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      let left = 0;
      let right = document.documentElement.clientWidth;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox !== "visible") {
          const b = a.getBoundingClientRect();
          left = Math.max(left, b.left);
          right = Math.min(right, b.right);
        }
      }
      const inside = r.left >= left - 1 && r.right <= right + 1;
      const outside = r.right <= left + 1 || r.left >= right - 1;
      if (!inside && !outside) bad.push(`${el.textContent?.trim()} (${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(left)}..${Math.round(right)})`);
    }
    return bad;
  });
}

// An action must change what the page shows (a selected state, a loading state, a result or a
// message) within a few seconds; doing nothing visible fails.
export async function reacts(page: Page, name: string, action: () => Promise<unknown>) {
  const before = await page.locator("main").innerHTML();
  await action();
  await expect
    .poll(async () => (await page.locator("main").innerHTML()) !== before, {
      timeout: 8000,
      message: `${name}: no visible change and no message`,
    })
    .toBe(true);
}

export const pause = (page: Page, ms = 1500) => page.waitForTimeout(ms); // stay under the rate limit

// Contrast against what is behind (WCAG ratio). The logo: its strongest pixel drawn over its
// background must reach 3:1; every visible text 3:1; the chart's data line 3:1. Catches anything
// ink-on-ink or paper-on-paper in either theme.
export async function lowContrast(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? ["0", "0", "0", "0"]).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const bgOf = (el: Element | null): number[] => {
      for (let a = el; a; a = a.parentElement) {
        const c = rgb(getComputedStyle(a).backgroundColor);
        if (c.length < 4 || c[3] > 0.5) return c.slice(0, 3);
      }
      return rgb(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    };
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.5;
    };
    const bad: string[] = [];
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(".lockup img"))) {
      if (!shown(img)) continue;
      await Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || 540;
      c.height = img.naturalHeight || 127;
      const x = c.getContext("2d")!;
      const bg = bgOf(img);
      x.fillStyle = `rgb(${bg.join(",")})`;
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let best = 1;
      for (let i = 0; i < d.length; i += 16) best = Math.max(best, ratio([d[i], d[i + 1], d[i + 2]], bg));
      if (best < 3) bad.push(`logo ${img.getAttribute("src")}: ${best.toFixed(2)}:1`);
    }
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const el = w.currentNode.parentElement;
      if (!el || !(w.currentNode.textContent ?? "").trim() || !shown(el) || el.closest("option, title")) continue;
      if (el.closest("details:not([open])") && !el.closest("summary")) continue; // not shown
      const fg = rgb(getComputedStyle(el).color);
      const r = ratio(fg.slice(0, 3), bgOf(el));
      if (r < 3) bad.push(`text "${(w.currentNode.textContent ?? "").trim().slice(0, 40)}": ${r.toFixed(2)}:1`);
    }
    for (const line of Array.from(document.querySelectorAll<SVGElement>("svg polyline, svg .data-line"))) {
      if (!shown(line)) continue;
      const r = ratio(rgb(getComputedStyle(line).stroke).slice(0, 3), bgOf(line.closest("svg")));
      if (r < 3) bad.push(`chart line: ${r.toFixed(2)}:1`);
    }
    return [...new Set(bad)];
  });
}
