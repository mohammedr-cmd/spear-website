import { useEffect, useRef, useState, type ReactNode } from "react";
import { figure, price } from "../format";
import { useLang } from "../i18n";

// A date or period: left-to-right numbers in English; in Arabic it reads as Arabic text
export function D({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  return lang === "ar" ? <span className="date">{children}</span> : <bdi className="num">{children}</bdi>;
}

// A statement figure as printed: tabular, left-to-right, negatives in brackets and signal-down.
export function Fig({ v, className = "" }: { v: string | null | undefined; className?: string }) {
  const f = figure(v);
  return <bdi className={`num ${f.negative ? "neg" : ""} ${className}`}>{f.text}</bdi>;
}

// A price or per-share amount: always at least two decimals (36.80, 1.00), never rounded.
export function Price({ v, className = "" }: { v: string | null | undefined; className?: string }) {
  const t = price(v);
  return <bdi className={`num ${t.startsWith("(") ? "neg" : ""} ${className}`}>{t}</bdi>;
}

type Bi = { en: string; ar: string | null };

// One text in the reader's language. In Arabic, the English original is one tap away.
export function BiText({ t, className = "" }: { t: Bi | null | undefined; className?: string }) {
  const { lang } = useLang();
  const [orig, setOrig] = useState(false);
  if (!t) return null;
  if (lang === "en" || !t.ar) {
    return (
      <span className={`ltr-block ${className}`} lang="en">
        {t.en}
      </span>
    );
  }
  return (
    <span className={className}>
      <span lang="ar">{t.ar}</span>{" "}
      <button type="button" className="orig" onClick={() => setOrig(!orig)} aria-expanded={orig}>
        {orig ? "إخفاء الأصل" : "الأصل بالإنجليزية"}
      </button>
      {orig && (
        <span className="ltr-block orig-text" lang="en">
          {t.en}
        </span>
      )}
    </span>
  );
}

// The tool's notes for the reader (the API keeps the model's instructions out), each in the
// reader's language with its English original on tap.
export function Notes({ res }: { res: any }) {
  const notes: Bi[] = res?.reader_notes ?? [];
  if (!notes.length) return null;
  return (
    <ul className="notes">
      {notes.map((n, i) => (
        <li key={i}>
          <BiText t={n} />
        </li>
      ))}
    </ul>
  );
}

// "Data provided by SAHMK" wherever prices appear, with the tool's label and retrieval date.
export function SahmkLine({ res }: { res: any }) {
  if (!res) return null;
  const cite = (res.sources ?? []).find((s: any) => s?.citation_text)?.citation_text;
  return (
    <div className="source-line">
      <BiText t={res.attribution_text ?? { en: "Data provided by SAHMK", ar: "البيانات مقدَّمة من سهمك" }} />
      {res.label_text && (
        <>
          {" · "}
          <BiText t={res.label_text} />
        </>
      )}
      {cite && (
        <>
          {" · "}
          <BiText t={cite} />
        </>
      )}
    </div>
  );
}

export function NotAnswered({ reason, instead }: { reason: ReactNode; instead?: ReactNode }) {
  const { t } = useLang();
  return (
    <div className="card refused">
      <div className="eyebrow">{t.notAnswered}</div>
      <div style={{ marginTop: 6 }}>{reason}</div>
      {instead && <div className="small" style={{ marginTop: 8 }}>{instead}</div>}
    </div>
  );
}

// Why a tool gave no answer: its own reader notes, or the request's error (e.g. too many
// requests). Never "not in data" unless the tool said so.
export function WhyNot({ res }: { res: any }) {
  if (res?.status === "error") {
    return <NotAnswered reason={<span className="ltr-block" lang="en">{res.message ?? "The request failed."}</span>} />;
  }
  const notes: Bi[] = res?.reader_notes ?? [];
  return (
    <NotAnswered
      reason={
        notes.length ? (
          notes.map((n, i) => (
            <div key={i}>
              <BiText t={n} />
            </div>
          ))
        ) : (
          <BiText t={{ en: "Not in Spear Analytics data.", ar: "غير موجود في بيانات تحليلات رمح." }} />
        )
      }
    />
  );
}

export function Loading() {
  const { t } = useLang();
  return <p className="muted small">{t.loading}</p>;
}

// a tool response that answered nothing: "Not in Spear Analytics data." or a refusal
export function isAnswered(res: any): boolean {
  return res && res.status && !["not_in_data", "refused", "error"].includes(res.status);
}

// "How this was computed": the full working, folded under the figure
export function Working({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  return (
    <details className="working">
      <summary>{lang === "ar" ? "كيف حُسب هذا" : "How this was computed"}</summary>
      <div className="working-body">{children}</div>
    </details>
  );
}

// A table wider than its panel: the item column stays fixed, and an arrow says there is more to
// the side (no fade: the brand has no gradients). The arrow scrolls one step and hides at the end.
export function ScrollCue({ children, label }: { children: ReactNode; label: string }) {
  const { lang } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setMore(el.scrollWidth - el.clientWidth - Math.abs(el.scrollLeft) > 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [children]);
  const step = () => {
    const el = ref.current;
    if (el) el.scrollBy({ left: (lang === "ar" ? -1 : 1) * el.clientWidth * 0.6, behavior: "smooth" });
  };
  return (
    <div className="cue-wrap">
      <div className="scroll" ref={ref}>
        {children}
      </div>
      {more && (
        <button type="button" className="scroll-cue" onClick={step} aria-label={label}>
          <span className="small">{label}</span> <span aria-hidden="true">{lang === "ar" ? "←" : "→"}</span>
        </button>
      )}
    </div>
  );
}
