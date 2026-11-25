import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { day, price, type Lang } from "../format";
import { useLang } from "../i18n";

// The Market page's price chart (Mo, 25 Nov 2026). Every daily close the tool returned is drawn,
// none sampled; time runs left to right in both languages, as market charts do. The hover card
// shows only tool values: a day with no close (a weekend, a holiday) shows nothing, and nothing
// is interpolated between days. Ink line, hairline grid, no fill, no gradient.
export type Bar = { date: string; close: string };

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAY = 86_400_000;
const t = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// 3 to 5 round values inside [min, max]: steps of 1, 2, 2.5 or 5 times a power of ten
function niceTicks(min: number, max: number): number[] {
  const span = max - min || Math.abs(max) || 1;
  let best: number[] = [];
  for (const want of [4, 5, 3, 6, 2]) {
    const raw = span / want;
    const mag = 10 ** Math.floor(Math.log10(raw));
    for (const m of [1, 2, 2.5, 5, 10]) {
      const step = m * mag;
      const lo = Math.ceil(min / step) * step;
      const out: number[] = [];
      for (let v = lo; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
      if (out.length >= 3 && out.length <= 5) return out;
      if (!best.length || Math.abs(out.length - 4) < Math.abs(best.length - 4)) best = out;
    }
  }
  return best;
}

function timeTicks(t0: number, t1: number, width: number, lang: Lang): { at: number; label: string }[] {
  const days = (t1 - t0) / DAY;
  const out: { at: number; label: string }[] = [];
  const months = lang === "ar" ? MONTHS_AR : MONTHS_EN;
  const d = new Date(t0);
  if (days <= 45) {
    // weekly: each Monday
    for (let x = t0; x <= t1; x += DAY) {
      if (new Date(x).getUTCDay() === 1) out.push({ at: x, label: day(iso(x), lang).replace(/ \d{4}$/, "") });
    }
  } else if (days <= 800) {
    for (let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1; ; m++) {
      const at = Date.UTC(y + Math.floor(m / 12), m % 12, 1);
      if (at > t1) break;
      const mm = new Date(at);
      out.push({ at, label: `${months[mm.getUTCMonth()]} ${mm.getUTCFullYear()}` });
    }
  } else {
    for (let y = d.getUTCFullYear() + 1; ; y++) {
      const at = Date.UTC(y, 0, 1);
      if (at > t1) break;
      out.push({ at, label: String(y) });
    }
  }
  // keep labels at least 72px apart
  const minGap = (72 / width) * (t1 - t0);
  const kept: typeof out = [];
  for (const k of out) if (!kept.length || k.at - kept[kept.length - 1].at >= minGap) kept.push(k);
  return kept;
}

export function PriceChart({ rows }: { rows: Bar[] }) {
  const { lang } = useLang();
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const phone = w < 600;
  const H = phone ? 240 : 300;
  const M = { left: phone ? 52 : 64, right: phone ? 64 : 84, top: 28, bottom: 30 };
  const plotW = Math.max(1, w - M.left - M.right);
  const plotH = H - M.top - M.bottom;

  const g = useMemo(() => {
    if (rows.length < 2) return null;
    const closes = rows.map((r) => Number(r.close));
    let hi = 0;
    let lo = 0;
    closes.forEach((c, i) => {
      if (c > closes[hi]) hi = i;
      if (c < closes[lo]) lo = i;
    });
    // headroom above the high and below the low, so their labels sit inside the plot, clear of
    // the time axis below and of each other (Mo, 25 Nov 2026)
    const span = closes[hi] - closes[lo] || Math.abs(closes[hi]) || 1;
    const vmin = closes[lo] - span * 0.14;
    const vmax = closes[hi] + span * 0.14;
    const ticks = niceTicks(vmin, vmax).filter((v) => v >= vmin && v <= vmax);
    const t0 = t(rows[0].date);
    const t1 = t(rows[rows.length - 1].date);
    return { closes, hi, lo, ticks, vmin, vmax, t0, t1 };
  }, [rows]);
  if (!g) return <div ref={wrap} />;

  const x = (ms: number) => M.left + ((ms - g.t0) / (g.t1 - g.t0 || 1)) * plotW;
  const y = (v: number) => M.top + plotH - ((v - g.vmin) / (g.vmax - g.vmin || 1)) * plotH;
  const pts = rows.map((r, i) => `${x(t(r.date)).toFixed(1)},${y(g.closes[i]).toFixed(1)}`).join(" ");
  const last = rows.length - 1;

  // the trading day under the pointer: the close of that day, or of the last trading day within
  // the pixel's span of days; none when no trading day falls there
  function pick(clientX: number) {
    const box = wrap.current!.getBoundingClientRect();
    const px = clientX - box.left;
    if (px < M.left - 2 || px > M.left + plotW + 2) return setHover(null);
    const perPx = (g!.t1 - g!.t0) / plotW;
    const from = g!.t0 + (px - 0.5 - M.left) * perPx;
    const to = g!.t0 + (px + 0.5 - M.left) * perPx;
    const lo = Math.floor(from / DAY) * DAY;
    const hiT = Math.max(lo, Math.floor(to / DAY) * DAY);
    let found: number | null = null;
    for (let i = 0; i < rows.length; i++) {
      const d = t(rows[i].date);
      if (d >= lo && d <= hiT) found = i;
      if (d > hiT) break;
    }
    setHover(found);
  }
  const onMove = (e: PointerEvent) => pick(e.clientX);
  function onKey(e: KeyboardEvent) {
    const i = hover ?? last;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -20, PageDown: 20 };
    if (e.key in step) setHover(Math.max(0, Math.min(last, i + step[e.key])));
    else if (e.key === "Home") setHover(0);
    else if (e.key === "End") setHover(last);
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  }

  const label = (i: number) => price(rows[i].close);
  const dateText = (i: number) => day(rows[i].date, lang);
  const hx = hover !== null ? x(t(rows[hover].date)) : 0;
  const hy = hover !== null ? y(g.closes[hover]) : 0;
  const cardLeft = hover === null ? 0 : hx + 12 + 150 > w ? hx - 12 - 150 : hx + 12;
  const clampX = (v: number) => Math.max(M.left + 44, Math.min(M.left + plotW - 44, v));
  // the high's label above its point, the low's below; if the two would meet (a flat range),
  // the low's moves to the other side of its point
  const hiX = clampX(x(t(rows[g.hi].date)));
  const loX = clampX(x(t(rows[g.lo].date)));
  const hiTop = y(g.closes[g.hi]) - 22;
  let loTop = y(g.closes[g.lo]) + 6;
  if (Math.abs(hiX - loX) < 96 && Math.abs(hiTop - loTop) < 20) loTop = hiTop + 22;
  const ar = lang === "ar";
  const dir = ar ? "rtl" : "ltr";

  return (
    <div className="pchart" ref={wrap} style={{ height: H }} dir="ltr">
      <svg width={w} height={H} aria-hidden="true">
        {g.ticks.map((v) => (
          <line key={v} x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} className="grid" />
        ))}
        <line x1={M.left} x2={M.left + plotW} y1={M.top + plotH} y2={M.top + plotH} className="axis" />
        <polyline points={pts} className="data-line" fill="none" />
        <circle cx={x(t(rows[g.hi].date))} cy={y(g.closes[g.hi])} r={3} className="mark-dot" />
        <circle cx={x(t(rows[g.lo].date))} cy={y(g.closes[g.lo])} r={3} className="mark-dot" />
        <circle cx={x(t(rows[last].date))} cy={y(g.closes[last])} r={3} className="last-dot" />
        {hover !== null && (
          <>
            <line x1={hx} x2={hx} y1={M.top} y2={M.top + plotH} className="guide" />
            <circle cx={hx} cy={hy} r={4.5} className="hover-dot" />
          </>
        )}
      </svg>
      {/* the price scale, away from the latest point (which is at the right) */}
      {g.ticks.map((v) => (
        <span key={v} className="ptick num" style={{ top: y(v) - 8, left: 0, width: M.left - 8 }}>
          {price(v.toFixed(2))}
        </span>
      ))}
      {timeTicks(g.t0, g.t1, plotW, lang).map((k) => (
        <span key={k.at} className="ttick" dir={dir} style={{ left: x(k.at), top: M.top + plotH + 6 }}>
          {k.label}
        </span>
      ))}
      {/* the latest close, in the right margin, clear of the line */}
      <span className="plabel latest num" style={{ top: Math.max(M.top - 8, Math.min(M.top + plotH - 8, y(g.closes[last]) - 9)), left: M.left + plotW + 8 }}>
        {label(last)}
      </span>
      {/* the period's high and low, with their values */}
      <span className="plabel hl" dir={dir} style={{ left: hiX, top: hiTop }}>
        {ar ? "الأعلى " : "High "}
        <bdi className="num">{label(g.hi)}</bdi>
      </span>
      <span className="plabel hl" dir={dir} style={{ left: loX, top: loTop }}>
        {ar ? "الأدنى " : "Low "}
        <bdi className="num">{label(g.lo)}</bdi>
      </span>
      {hover !== null && (
        <div className="hover-card" dir={dir} style={{ left: cardLeft, top: Math.max(4, Math.min(H - 64, hy - 30)) }}>
          <div className="small muted">{dateText(hover)}</div>
          <div>
            {ar ? "الإغلاق " : "Close "}
            <bdi className="num">{label(hover)}</bdi>
          </div>
        </div>
      )}
      <div
        className="pchart-hit"
        style={{ left: M.left, width: plotW, top: M.top, height: plotH }}
        tabIndex={0}
        role="slider"
        aria-label={ar ? "الرسم البياني للسعر: استخدم الأسهم للتنقل بين الأيام" : "Price chart: use the arrow keys to move between days"}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={hover ?? last}
        aria-valuetext={`${dateText(hover ?? last)}: ${label(hover ?? last)}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHover(null);
        }}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      />
    </div>
  );
}

export function monthYear(isoDate: string, lang: Lang) {
  const d = new Date(t(isoDate));
  return `${(lang === "ar" ? MONTHS_AR : MONTHS_EN)[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
