import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { figure, price } from "../format";
import { Boundary } from "./Boundary";
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

export type Bi = { en: string; ar: string | null };

// One "English original" toggle per card (Mo, 25 Nov 2026): every Arabic text inside an
// <Originals> shows its English original when the card's single toggle is on.
const OrigCtx = createContext<{ show: boolean; add: (n: number) => void } | null>(null);

export function Originals({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  const [show, setShow] = useState(false);
  const [n, setN] = useState(0);
  const add = useCallback((k: number) => setN((x) => x + k), []);
  const ctx = useMemo(() => ({ show, add }), [show, add]);
  return (
    <OrigCtx.Provider value={ctx}>
      {children}
      {lang === "ar" && n > 0 && (
        <button type="button" className="orig orig-card" onClick={() => setShow(!show)} aria-expanded={show}>
          {show ? "إخفاء الأصل بالإنجليزية" : "الأصل بالإنجليزية"}
        </button>
      )}
    </OrigCtx.Provider>
  );
}

// One text in the reader's language. In Arabic, the English original is one tap away: the card's
// toggle inside <Originals>, or the text's own toggle outside one.
export function BiText({ t, className = "" }: { t: Bi | null | undefined; className?: string }) {
  const { lang } = useLang();
  const ctx = useContext(OrigCtx);
  const [own, setOwn] = useState(false);
  const arabic = lang === "ar" && !!t?.ar;
  useEffect(() => {
    if (!ctx || !arabic) return;
    ctx.add(1);
    return () => ctx.add(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arabic, ctx?.add]);
  if (!t) return null;
  if (!arabic) {
    return (
      <span className={`ltr-block ${className}`} lang="en">
        {t.en}
      </span>
    );
  }
  const show = ctx ? ctx.show : own;
  return (
    <span className={className}>
      <span lang="ar">{t.ar}</span>
      {!ctx && (
        <>
          {" "}
          <button type="button" className="orig" onClick={() => setOwn(!own)} aria-expanded={own}>
            {own ? "إخفاء الأصل" : "الأصل بالإنجليزية"}
          </button>
        </>
      )}
      {show && (
        <span className="ltr-block orig-text" lang="en">
          {t.en}
        </span>
      )}
    </span>
  );
}

// The tool's notes for the reader (the API keeps the model's instructions out), each in the
// reader's language; the card's one toggle shows the English originals.
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

const ATTRIBUTION: Bi = { en: "Data provided by SAHMK", ar: "البيانات مقدَّمة من سهمك" };

// SAHMK attribution, short form, on each card that shows SAHMK data (Mo, 25 Nov 2026). The full
// line (label, source, retrieval date) is once at the foot of the page: <SahmkFoot>.
export function SahmkLine({ res }: { res: any }) {
  if (!res) return null;
  return (
    <div className="source-line">
      <BiText t={ATTRIBUTION} />
    </div>
  );
}

// The full SAHMK line, once per page: each distinct label and retrieval date of the responses
// shown on the page.
export function SahmkFoot({ res }: { res: any[] }) {
  const shown = res.filter((r) => r && r.status !== "error" && (r.label_text || r.sources));
  if (!shown.length) return null;
  const seen = new Set<string>();
  const parts: Bi[] = [];
  const push = (b: Bi | undefined | null) => {
    if (b && !seen.has(b.en)) {
      seen.add(b.en);
      parts.push(b);
    }
  };
  push(shown.find((r) => r.attribution_text)?.attribution_text ?? ATTRIBUTION);
  for (const r of shown) push(r.label_text);
  for (const r of shown) for (const s of r.sources ?? []) push(s?.citation_text);
  return (
    <footer className="page-foot small muted">
      <Originals>
        {parts.map((b, i) => (
          <span key={i}>
            {i > 0 && " · "}
            <BiText t={b} />
          </span>
        ))}
      </Originals>
    </footer>
  );
}

// A source document as a reader names it ("SNB, Q3 2026 report, page 4"), in `lang`; the file id
// only when the API gave no name.
export function docLabel(row: { document: string; document_text?: Bi; page?: number | null }, lang: "en" | "ar"): string {
  const name = (lang === "ar" ? row.document_text?.ar : row.document_text?.en) ?? row.document_text?.en ?? row.document;
  if (row.page === undefined || row.page === null) return name;
  return lang === "ar" ? `${name}، صفحة ${row.page}` : `${name}, page ${row.page}`;
}

export function NotAnswered({ reason, instead }: { reason: ReactNode; instead?: ReactNode }) {
  const { t } = useLang();
  return (
    <div className="card refused">
      <Originals>
        <div className="eyebrow">{t.notAnswered}</div>
        <div style={{ marginTop: 6 }}>{reason}</div>
        {instead && <div className="small" style={{ marginTop: 8 }}>{instead}</div>}
      </Originals>
    </div>
  );
}

// Why a tool gave no answer: its own reader notes, or the request's error (e.g. too many
// requests). Never "not in data" unless the tool said so.
// A failed request's reason, in the page's language (Mo, 25 Nov 2026): never a generic error.
// Spear unreachable is not here: the whole page switches to the offline screen instead.
const REASONS: Record<string, Bi> = {
  rate_limited: {
    en: "Request limit reached: too many requests in a minute. Wait a minute and try again.",
    ar: "بلغت حد الطلبات: طلبات كثيرة في دقيقة واحدة. انتظر دقيقة ثم أعد المحاولة.",
  },
  signed_out: { en: "Your session has ended. Sign in again.", ar: "انتهت جلستك. سجّل الدخول مرة أخرى." },
  forbidden: { en: "Not allowed for this account.", ar: "غير مسموح لهذا الحساب." },
  not_allowed: { en: "Not allowed for this account.", ar: "غير مسموح لهذا الحساب." },
  not_found: { en: "Not in Spear Analytics data.", ar: "غير موجود في بيانات تحليلات رمح." },
  timeout: {
    en: "Spear took more than 5 seconds to answer. Try again.",
    ar: "تأخّر رمح أكثر من 5 ثوانٍ في الرد. أعد المحاولة.",
  },
  invalid: {
    en: "Spear refused the request as not valid: a fault in this page, not in the data.",
    ar: "رفض رمح الطلب لأنه غير صالح: خلل في هذه الصفحة لا في البيانات.",
  },
  tool_error: {
    en: "The tool failed on this request: a fault in Spear, not in the data.",
    ar: "تعذّر على الأداة إجابة هذا الطلب: خلل في رمح لا في البيانات.",
  },
  server_error: {
    en: "Spear answered with a server error: a fault in Spear, not in the data.",
    ar: "ردّ رمح بخطأ في الخادم: خلل في رمح لا في البيانات.",
  },
};

export function reasonOf(res: any): Bi {
  return REASONS[res?.error] ?? REASONS[res?.http === 429 ? "rate_limited" : "server_error"];
}

// Why a tool gave no answer: its own reader notes, or the request's named reason. Never "not in
// data" unless the tool said so.
export function WhyNot({ res }: { res: any }) {
  if (res?.status === "error") {
    return <NotAnswered reason={<BiText t={reasonOf(res)} />} />;
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

// A page-level request (not a tool) that failed: the same named reasons.
export function Failed({ error }: { error: unknown }) {
  const e = error as { code?: string; status?: number };
  return <WhyNot res={{ status: "error", error: e?.code, http: e?.status }} />;
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

export const PART_FAILED: Bi = {
  en: "This part of the page couldn't be shown: a fault in this page, not in the data. The rest of the page still works.",
  ar: "تعذّر عرض هذا الجزء من الصفحة: خلل في الصفحة لا في البيانات. بقية الصفحة تعمل.",
};

export function PartFailed({ retry }: { retry: () => void }) {
  const { lang } = useLang();
  return (
    <div className="panel-body">
      <NotAnswered
        reason={<BiText t={PART_FAILED} />}
        instead={
          <button type="button" className="quiet" onClick={retry}>
            {lang === "ar" ? "أعد المحاولة" : "Try again"}
          </button>
        }
      />
    </div>
  );
}

// A card: its Arabic texts share one "English original" toggle, at the card's foot; a failure
// inside it stays inside it ("Not answered", with the reason), never a blank page. Its content is
// given as a function, so it is worked out inside the card's own boundary: an error anywhere in
// it, even in the page's own expressions, is caught here and nowhere else.
type PanelContent = ReactNode | (() => ReactNode);
function Content({ c }: { c: PanelContent }) {
  return <>{typeof c === "function" ? (c as () => ReactNode)() : c}</>;
}
export function Panel({ children, className = "", style }: { children: PanelContent; className?: string; style?: CSSProperties }) {
  return (
    <section className={`panel ${className}`} style={style}>
      <Boundary name="panel" fallback={(retry) => <PartFailed retry={retry} />}>
        <Originals>
          <Content c={children} />
        </Originals>
      </Boundary>
    </section>
  );
}

// What a figure's note marker means, in words (Mo, 25 Nov 2026): a labelled tag, never a bare
// dot or star. Choosing the figure opens its source panel, which holds the note itself.
export const TAGS = {
  restated: { en: "restated", ar: "معاد عرضه", why: { en: "the report re-presents this figure", ar: "التقرير أعاد عرض هذا الرقم" } },
  includes: { en: "scope", ar: "نطاق", why: { en: "the printed row's scope differs from the item's name", ar: "نطاق البند المطبوع يختلف عن اسمه" } },
  differs: { en: "differs", ar: "مختلف", why: { en: "reports print different values for it", ar: "تطبعه التقارير بقيم مختلفة" } },
} as const;
export type TagKey = keyof typeof TAGS;

export function tagsOf(r: { restated?: string | null; includes?: string | null; reports_differ?: boolean } | null | undefined): TagKey[] {
  if (!r) return [];
  const out: TagKey[] = [];
  if (r.restated) out.push("restated");
  if (r.includes) out.push("includes");
  if (r.reports_differ) out.push("differs");
  return out;
}

export function NoteTags({ tags }: { tags: TagKey[] }) {
  const { lang } = useLang();
  if (!tags.length) return null;
  return (
    <span className="tags">
      {tags.map((k) => (
        <span key={k} className="tag">
          {TAGS[k][lang]}
        </span>
      ))}
    </span>
  );
}

// The tags' meanings, once above a table, for the tags the table shows
export function TagLegend({ tags }: { tags: TagKey[] }) {
  const { lang } = useLang();
  const shown = (Object.keys(TAGS) as TagKey[]).filter((k) => tags.includes(k));
  if (!shown.length) return null;
  return (
    <p className="legend small muted">
      {shown.map((k, i) => (
        <span key={k}>
          {i > 0 && (lang === "ar" ? "؛ " : "; ")}
          <span className="tag">{TAGS[k][lang]}</span> {TAGS[k].why[lang]}
        </span>
      ))}
      {lang === "ar" ? ". اختر الرقم لقراءة الملاحظة." : ". Choose the figure to read the note."}
    </p>
  );
}
