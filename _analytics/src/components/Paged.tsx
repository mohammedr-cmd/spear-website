import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLang } from "../i18n";

// A table whose columns (periods, companies) are shown a page at a time, as many as fit whole
// beside the item column (Mo, 25 Nov 2026). Nothing scrolls sideways, so no figure is ever cut
// by an edge or a fixed column, and the first page (the newest period, or the first companies)
// shows on load in both directions. The page buttons sit above the table, never over it.
export function Paged({
  total,
  noun,
  fixedWidth = 0,
  minItem,
  children,
}: {
  total: number;
  noun: { en: string; ar: string };
  fixedWidth?: number; // other columns always shown (a total, a coverage count)
  minItem?: number;
  children: (start: number, count: number, colWidth: number) => ReactNode;
}) {
  const { lang } = useLang();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [colWidth, setColWidth] = useState(0);
  const [start, setStart] = useState(0);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // sizes follow the screen, not the table's box (a source panel opening narrows the box)
  const phone = typeof window !== "undefined" && window.innerWidth < 860;
  const col = colWidth || (phone ? 124 : 150);
  const item = minItem ?? (phone ? 150 : 240);
  const count = Math.max(1, Math.min(total, Math.floor((width - item - fixedWidth) / col) || 1));
  useEffect(() => setStart(0), [total]);
  const s = Math.min(start, Math.max(0, total - count));

  // A figure wider than its column widens the paged columns, and only those (cells marked
  // data-paged): widening can always make them fit, so this settles. It is measured once per data
  // set and width, and never past 360px, so it can't loop (Mo, 25 Nov 2026: the total column
  // once sent it round forever and blanked the page).
  const measured = useRef("");
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const key = `${total}|${width}|${el.querySelectorAll("td[data-paged]").length}`;
    if (measured.current === key) return;
    // the widest figure (or tag) in a paged cell, with the cell's padding, against the cell
    let need = 0;
    el.querySelectorAll<HTMLElement>("td[data-paged], th[data-paged]").forEach((td) => {
      const cs = getComputedStyle(td);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      td.querySelectorAll<HTMLElement>(".num, .tag, .date").forEach((f) => {
        const inner = f.closest("button");
        const ipad = inner ? parseFloat(getComputedStyle(inner).paddingLeft) + parseFloat(getComputedStyle(inner).paddingRight) : 0;
        need = Math.max(need, Math.ceil(f.getBoundingClientRect().width + pad + ipad - td.clientWidth));
      });
    });
    measured.current = key;
    if (need > 0 && col < 360) setColWidth(Math.min(360, col + need + 8));
  });

  const end = Math.min(total, s + count);
  const ar = lang === "ar";
  return (
    <div className="paged" ref={wrap}>
      {total > count && (
        <div className="pager" role="group" aria-label={ar ? noun.ar : noun.en}>
          <span className="small muted">
            {ar ? (
              <>
                {noun.ar} <bdi className="num">{s + 1}</bdi>–<bdi className="num">{end}</bdi> من <bdi className="num">{total}</bdi>
              </>
            ) : (
              <>
                {noun.en} <bdi className="num">{s + 1}</bdi>–<bdi className="num">{end}</bdi> of <bdi className="num">{total}</bdi>
              </>
            )}
          </span>
          <span className="pager-buttons">
            <button type="button" className="quiet" disabled={s === 0} onClick={() => setStart(Math.max(0, s - count))}>
              {ar ? "→ السابق" : "← Previous"}
            </button>
            <button type="button" className="quiet" disabled={end >= total} onClick={() => setStart(s + count)}>
              {ar ? "التالي ←" : "Next →"}
            </button>
          </span>
        </div>
      )}
      {width > 0 && children(s, end - s, col)}
    </div>
  );
}
