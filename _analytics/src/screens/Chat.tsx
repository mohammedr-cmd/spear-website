import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, get, post } from "../api";
import { day, type Lang } from "../format";
import { useLang } from "../i18n";
import { NotAnswered, docLabel } from "../components/Bits";
import { SourcePanel, type FactRow } from "../components/SourcePanel";
import type { Me } from "../App";

// Chat, a full page (docs/web-ui.md section 6; Mo, 26 Nov 2026). The owner's account only, behind
// the owner's switch; members see "coming soon". The API refuses to switch chat on while the
// company-and-period reader isn't merged, or while the instruction text differs from the one that
// passed the benchmark: the page then says why, plainly.
//
// A question runs on the server as a job. The page polls it and shows each step as it happens
// (reading the question, looking up the company, reading the statement, checking every figure),
// then the answer: Spear's text with each figure Spear rendered drawn as a figure card, and each
// source as a chip that opens the boxed page. A host that is unavailable or rate-limited gives
// "Chat is temporarily unavailable, please try again" at once, with a retry; never an error page.

type Status = { on: boolean; state: string; why: string | null; switch?: boolean; can_switch_on?: boolean };
type Cell = FactRow & { symbol?: string };
type Figure = { n: number; ref: string; type: string; text: string; cells: Cell[] };
type Segment = { text: string; ref?: string; n?: number };
type Card = {
  kind: "answer" | "not_answered" | "clarify" | "market_page";
  reason: string | null;
  lang: Lang;
  text: string;
  segments?: Segment[];
  figures?: Figure[];
  notes?: string[];
  read_as?: ReadAs;
};
type ReadAs = {
  companies: { symbol: string; name_en: string; name_ar: string }[];
  sector: string | null;
  periods: { period_end: string; months: number | null; en: string; ar: string; relative?: string | null }[];
  unstated: string[];
  // the reader's own line, with what a relative phrase ("latest", "last year") was read as
  line?: { en: string; ar: string };
};
type JobView = { id: string; status: "running" | "done"; question: string; steps: string[]; seconds: number; card?: Card };
type Exchange = { q: string; job?: JobView; card?: Card; unavailable?: boolean; replay?: boolean };

const ARABIC = /[؀-ۿ]/;
// an Arabic question gets an Arabic answer, right to left, whatever the page's language
export const answerLang = (q: string): Lang => (ARABIC.test(q) ? "ar" : "en");

const STEPS: Record<string, [string, string]> = {
  question: ["Reading your question", "قراءة سؤالك"],
  scope: ["Finding the company and period", "تحديد الشركة والفترة"],
  company: ["Looking up the company", "البحث عن الشركة"],
  coverage: ["Checking which reports Spear holds", "التحقق من التقارير المتاحة في رمح"],
  item: ["Finding the line item", "تحديد البند"],
  statement: ["Reading the statement", "قراءة القائمة المالية"],
  compare: ["Comparing the companies", "مقارنة الشركات"],
  source: ["Finding the page", "تحديد الصفحة"],
  tool: ["Using Spear's tools", "استخدام أدوات رمح"],
  checking: ["Checking every figure against Spear's data", "مطابقة كل رقم ببيانات رمح"],
  correcting: ["Correcting the draft", "تصحيح المسودة"],
};

const OFF: Record<string, { title: [string, string]; body: [string, string] }> = {
  coming_soon: {
    title: ["Chat is coming soon.", "المحادثة قريبًا."],
    body: [
      "It's being tested before it opens. Until then, every figure is on the Statements, Compare and Market pages.",
      "تُختبر قبل فتحها. وإلى ذلك الحين، كل الأرقام في صفحات القوائم المالية والمقارنة والسوق.",
    ],
  },
  reader_missing: {
    title: ["Chat is off until the company-and-period reader is merged.", "المحادثة متوقفة حتى دمج قارئ الشركة والفترة."],
    body: [
      "The reader tells the check which companies and periods a question asks about, so no figure from another company or period gets through. Until it is merged, chat stays off for your account too, and nothing is sent to the model.",
      "يحدّد القارئ للفحص الشركات والفترات التي يسأل عنها السؤال، فلا يمر رقم لشركة أو فترة أخرى. وإلى أن يُدمج، تبقى المحادثة متوقفة لحسابك أيضًا، ولا يُرسل شيء إلى النموذج.",
    ],
  },
  text_changed: {
    title: ["Chat is off: its instruction text changed.", "المحادثة متوقفة: تغيّر نص تعليماتها."],
    body: [
      "The text differs from the one that passed the benchmark. Run the benchmark's 500 again before chat can be switched on.",
      "يختلف النص عن النص الذي اجتاز اختبار الدقة. أعد تشغيل أسئلة الاختبار الخمسمئة قبل تفعيل المحادثة.",
    ],
  },
  switched_off: {
    title: ["Chat is off for your account.", "المحادثة متوقفة لحسابك."],
    body: [
      "Switch it on to ask questions. It's for your account only; members see “coming soon”.",
      "فعّلها لتطرح الأسئلة. وهي لحسابك فقط؛ ويرى الأعضاء «قريبًا».",
    ],
  },
  no_key: {
    title: ["Chat is off: the chat model's key isn't set on this PC.", "المحادثة متوقفة: مفتاح نموذج المحادثة غير مضبوط على هذا الجهاز."],
    body: ["Set OPENROUTER_API_KEY for the Spear service, then restart it.", "اضبط OPENROUTER_API_KEY لخدمة رمح ثم أعد تشغيلها."],
  },
};

const UNAVAILABLE: [string, string] = ["Chat is temporarily unavailable, please try again", "المحادثة غير متاحة مؤقتًا، يُرجى المحاولة مرة أخرى"];
const RETRY: [string, string] = ["Try again", "إعادة المحاولة"];
const NOT_ANSWERED_PREFIX = /^(Not answered|لم تتم الإجابة)\s*:\s*/;
const POLL_MS = 700;
const POLL_GIVE_UP = 3; // failed polls in a row before "temporarily unavailable"
const LONGEST_MS = 6 * 60_000;

const todayIso = () => new Date().toISOString().slice(0, 10);

export function Chat({ me }: { me: Me }) {
  const { t, lang } = useLang();
  const ar = lang === "ar";
  const [params] = useSearchParams();
  // development only: replay recorded benchmark turns through the web's card (no model call)
  const replays = import.meta.env.DEV ? (params.get("replay") ?? "").split(",").filter(Boolean) : [];
  const [status, setStatus] = useState<Status | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [thread, setThread] = useState<Exchange[]>([]);
  const [past, setPast] = useState<{ q: string; at: string }[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [src, setSrc] = useState<{ row: FactRow; item: string } | null>(null);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const busy = thread.some((x) => !x.card && !x.unavailable);

  function loadStatus() {
    setStatusFailed(false);
    get<Status>("/chat/status")
      .then(setStatus)
      .catch(() => setStatusFailed(true));
  }
  useEffect(loadStatus, []);

  // a new answer scrolls the thread, never the page
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = threadRef.current;
    if (el && thread.length) el.scrollTop = el.scrollHeight;
  }, [thread]);

  // false once the page is left, so a running poll stops (set again on mount: React runs
  // effects twice in development)
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  function update(i: number, patch: Partial<Exchange>) {
    if (live.current) setThread((th) => th.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  }
  // one question's job, polled until its card arrives
  async function follow(i: number, job: JobView) {
    const t0 = Date.now();
    let failed = 0;
    while (live.current) {
      if (job.status === "done" && job.card) return update(i, { job, card: job.card });
      if (Date.now() - t0 > LONGEST_MS) return update(i, { job, unavailable: true });
      await new Promise((r) => setTimeout(r, POLL_MS));
      try {
        job = await get<JobView>(`/chat/jobs/${job.id}`);
        failed = 0;
        update(i, { job });
      } catch (e) {
        if ((e instanceof ApiError && e.status === 404) || ++failed >= POLL_GIVE_UP) return update(i, { unavailable: true });
      }
    }
  }
  async function ask(question: string, replay?: string) {
    const i = thread.length;
    setThread((th) => [...th, { q: question, replay: Boolean(replay) }]);
    try {
      const job = await post<JobView>("/chat/ask", replay ? { replay: Number(replay) } : { question });
      update(i, { q: job.question, job });
      setPast((p) => [{ q: job.question, at: todayIso() }, ...p]);
      follow(i, job);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) loadStatus();
      update(i, { unavailable: true });
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text || !status?.on || busy) return;
    setQ("");
    ask(text);
  }
  async function setSwitch(on: boolean) {
    setSwitching(true);
    setSwitchError("");
    try {
      await post("/owner/settings", { chat_owner_on: on });
    } catch (e) {
      setSwitchError(e instanceof ApiError && e.message ? e.message : UNAVAILABLE[ar ? 1 : 0]);
    } finally {
      setSwitching(false);
      loadStatus();
    }
  }

  const on = Boolean(status?.on);
  const isOwner = me.role === "owner";
  const groups = past.reduce<{ label: string; items: string[] }[]>((acc, p) => {
    const label = p.at === todayIso() ? t.today : day(p.at, lang);
    const g = acc.find((x) => x.label === label);
    if (g) g.items.push(p.q);
    else acc.push({ label, items: [p.q] });
    return acc;
  }, []);
  const off = status && !on ? (OFF[status.why ?? ""] ?? OFF.coming_soon) : null;
  const askWhy = on
    ? busy
      ? ar
        ? "يُجاب عن السؤال السابق الآن."
        : "The last question is still being answered."
      : t.signedOffLine
    : `${off ? off.title[ar ? 1 : 0] : t.chatOff} ${t.signedOffLine}`;

  return (
    <div className="chat-page">
      <aside className={`history ${drawer ? "open" : ""}`} aria-label={t.earlier}>
        <div className="history-head">
          <button
            className="primary new-q"
            disabled={!on || busy}
            aria-describedby="ask-why"
            onClick={() => {
              setThread([]);
              setQ("");
              setDrawer(false);
            }}
          >
            + {t.newQuestion}
          </button>
          <button className="quiet drawer-close" onClick={() => setDrawer(false)} aria-label="×">
            ×
          </button>
        </div>
        {groups.length ? (
          groups.map((g) => (
            <section key={g.label}>
              <h3 className="eyebrow">{g.label}</h3>
              <ul>
                {g.items.map((p, i) => (
                  <li key={i} dir="auto" lang={answerLang(p)} data-allow-en={answerLang(p) === "en" ? "" : undefined}>
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="small muted">{t.noEarlier}</p>
        )}
      </aside>
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}

      <section className="chat-main">
        <div className="chat-bar">
          <button className="quiet drawer-open" onClick={() => setDrawer(true)}>
            ☰ {t.earlier}
          </button>
          <span className="eyebrow">{t.chat}</span>
          {isOwner && on && status?.switch && (
            <button data-sweep="skip" className="quiet small chat-switch" onClick={() => setSwitch(false)} disabled={switching || busy}>
              {ar ? "إيقاف المحادثة لحسابي" : "Switch chat off for my account"}
            </button>
          )}
        </div>
        <div className="thread" ref={threadRef}>
          {replays.length > 0 && (
            <div className="notice small replay-bar">
              <p style={{ margin: "0 0 8px" }}>
                {ar
                  ? "للتطوير فقط: إجابات مسجّلة من اختبار الدقة، تُعاد عبر بطاقة الموقع. لا يُستدعى أي نموذج، والمحادثة متوقفة."
                  : "Development only: recorded benchmark answers, replayed through the web's card. No model is called, and chat stays off."}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {replays.map((r) => (
                  <button key={r} className="btn" disabled={busy} onClick={() => ask("", r)}>
                    {ar ? `إعادة السؤال المسجّل ${r}` : `Replay recorded question ${r}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          {statusFailed ? (
            <div className="chat-off">
              <h1 className="title">{UNAVAILABLE[ar ? 1 : 0]}</h1>
              <button className="btn" onClick={loadStatus}>
                {RETRY[ar ? 1 : 0]}
              </button>
            </div>
          ) : off && !thread.length ? (
            <div className="chat-off">
              <span className="eyebrow">{t.chat}</span>
              <h1 className="title">{off.title[ar ? 1 : 0]}</h1>
              <p>{off.body[ar ? 1 : 0]}</p>
              {isOwner && status?.why === "switched_off" && status.can_switch_on && (
                <p>
                  <button data-sweep="skip" className="primary" onClick={() => setSwitch(true)} disabled={switching}>
                    {ar ? "تفعيل المحادثة لحسابي" : "Switch chat on for my account"}
                  </button>
                </p>
              )}
              {switchError && (
                <p className="small" role="status">
                  {switchError}
                </p>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link className="btn" to="/statements">
                  {t.statements}
                </Link>
                <Link className="btn" to="/compare">
                  {t.compare}
                </Link>
                {me.can_see_sahmk && (
                  <Link className="btn" to="/market">
                    {t.market}
                  </Link>
                )}
              </div>
            </div>
          ) : (
            thread.map((x, i) => (
              <div key={i} className="exchange">
                {x.q && (
                  <div className="bubble" dir="auto" lang={answerLang(x.q)} data-allow-en={answerLang(x.q) === "en" ? "" : undefined}>
                    {x.q}
                  </div>
                )}
                {x.unavailable || x.card?.reason === "host_unavailable" ? (
                  <Unavailable onRetry={x.replay || !x.q ? undefined : () => ask(x.q)} />
                ) : x.card ? (
                  <ChatCard
                    card={x.card}
                    canMarket={Boolean(me.can_see_sahmk)}
                    onSource={(row, item) => setSrc({ row, item })}
                    onRetry={x.replay ? undefined : () => ask(x.q)}
                  />
                ) : (
                  <Progress job={x.job} />
                )}
              </div>
            ))
          )}
        </div>
        <form className="askbar" onSubmit={submit}>
          <div className="ask">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.askPlaceholder}
              aria-label={t.ask}
              dir="auto"
              disabled={!on}
              readOnly={!on}
              maxLength={600}
              aria-describedby="ask-why"
            />
            <button className="primary" type="submit" disabled={!on || busy || !q.trim()} aria-describedby="ask-why">
              {t.ask}
            </button>
          </div>
          <p className="small muted signed-line" id="ask-why">
            {askWhy}
          </p>
        </form>
      </section>

      {src && (
        <div className="chat-source">
          <SourcePanel row={src.row} itemName={src.item} isOwner={isOwner} onClose={() => setSrc(null)} />
        </div>
      )}
    </div>
  );
}

// What is happening while the question is answered: each step as the server reports it, the one
// running now marked, and the time so far. In the page's language.
function Progress({ job }: { job?: JobView }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [t0] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const k = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(k);
  }, []);
  const steps = job?.steps?.length ? job.steps : ["question"];
  const secs = Math.max(job?.seconds ?? 0, (now - t0) / 1000);
  return (
    <div className="card chat-progress" role="status" aria-live="polite">
      <ol>
        {steps.map((s, i) => {
          const current = i === steps.length - 1;
          return (
            <li key={s + i} className={current ? "current" : "done"}>
              <span className="step-mark" aria-hidden="true">
                {current ? "" : "✓"}
              </span>
              {(STEPS[s] ?? STEPS.tool)[ar ? 1 : 0]}
              {current && <span className="dots" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      <p className="small muted" style={{ margin: "8px 0 0" }}>
        <bdi className="num">{Math.floor(secs)}</bdi> {ar ? "ث · تستغرق الإجابة عادةً نحو 17 ثانية" : "s · answers usually take about 17 seconds"}
      </p>
    </div>
  );
}

function Unavailable({ onRetry }: { onRetry?: () => void }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  return (
    <div className="card refused chat-unavailable" role="status">
      <div>{UNAVAILABLE[ar ? 1 : 0]}</div>
      {onRetry && (
        <button className="btn" style={{ marginTop: 10 }} onClick={onRetry}>
          {RETRY[ar ? 1 : 0]}
        </button>
      )}
    </div>
  );
}

// What the server read the question as: its companies (or the sector) and periods
function ReadAsLine({ r, lang }: { r?: ReadAs; lang: Lang }) {
  if (!r) return null;
  const ar = lang === "ar";
  if (r.line) return <div className="eyebrow read-as">{r.line[ar ? "ar" : "en"]}</div>;
  const sep = ar ? "، " : ", ";
  const who = r.sector
    ? ar
      ? `البنوك التي يغطيها رمح (${r.companies.length})`
      : `the banks Spear covers (${r.companies.length})`
    : r.companies.map((c) => `${ar ? c.name_ar : c.name_en} (${c.symbol})`).join(sep);
  const when = r.periods.map((p) => (ar ? p.ar : p.en)).join(sep);
  const parts = [
    who || (r.unstated.includes("company") ? (ar ? "الشركة غير مذكورة" : "company not stated") : ""),
    when || (r.unstated.includes("period") ? (ar ? "الفترة غير مذكورة" : "period not stated") : ""),
  ].filter(Boolean);
  return (
    <div className="eyebrow read-as">
      {ar ? "قُرئ السؤال على أنه" : "Read as"}: {parts.join(" · ")}
    </div>
  );
}

const citeOf = (c: Cell, lang: Lang) => (lang === "ar" ? `${c.document}، صفحة ${c.page}` : `${c.document}, page ${c.page}`);

// A citation Spear wrote ("1180_SNB_Q3-2026_En, page 4"), drawn as a chip with the document's
// readable name that opens the boxed page. The rest of the figure's text is Spear's, untouched.
function cites(text: string, cells: Cell[], lang: Lang, onSource: (c: Cell) => void): ReactNode[] {
  const marks = cells.filter((c) => c.document && c.page !== undefined && c.page !== null).map((c) => ({ c, s: citeOf(c, lang) }));
  const out: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest) {
    let best: { at: number; c: Cell; s: string } | null = null;
    for (const m of marks) {
      const at = rest.indexOf(m.s);
      if (at >= 0 && (!best || at < best.at)) best = { at, ...m };
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.at) out.push(rest.slice(0, best.at));
    const c = best.c;
    out.push(
      <button key={k++} type="button" className="src-chip" onClick={() => onSource(c)}>
        {docLabel(c, lang)}
      </button>,
    );
    rest = rest.slice(best.at + best.s.length);
  }
  return out;
}

// A figure's text as Spear wrote it: its amount (before the bracket), what it is (the bracket,
// without the citation, which becomes a chip), and the cells it cites. Only when that bracket is
// the figure's last: a change or a ranking ("Bank Albilad (1140) is the highest ...") stays whole.
function partsOf(f: Figure, lang: Lang): { amount: string | null; label: string; cited: Cell[] } {
  const cited = f.cells.filter((c) => f.text.includes(citeOf(c, lang)));
  const at = f.text.indexOf(" (");
  if (at <= 0 || !f.text.endsWith(")")) return { amount: null, label: f.text, cited };
  let depth = 0;
  for (let i = at + 1; i < f.text.length; i++) {
    if (f.text[i] === "(") depth++;
    else if (f.text[i] === ")" && --depth === 0 && i !== f.text.length - 1) return { amount: null, label: f.text, cited };
  }
  let label = f.text.slice(at + 2, -1);
  for (const c of cited) label = label.replace(citeOf(c, lang), "");
  return { amount: f.text.slice(0, at), label: label.replace(/\s*[;؛]\s*$/, "").trim(), cited };
}

// A figure in the answer's sentence: the amount in bold, what it is in one bracket, then its
// source chip after the bracket (never inside it), then its marker
function InlineFigure({ f, n, lang, onSource }: { f: Figure; n?: number; lang: Lang; onSource: (c: Cell) => void }) {
  const p = partsOf(f, lang);
  return (
    <span className="fig-inline">
      {p.amount ? (
        <>
          <strong>{p.amount}</strong> ({p.label})
        </>
      ) : (
        cites(f.text, f.cells, lang, onSource)
      )}
      {p.amount &&
        p.cited.map((c, i) => (
          <button key={i} type="button" className="src-chip" onClick={() => onSource(c)}>
            {docLabel(c, lang)}
          </button>
        ))}
      <sup className="fig-n">{n}</sup>
    </span>
  );
}

// a figure's sources: the first three, then the rest on request (a comparison cites every company)
function Chips({ cells, lang, onOpen }: { cells: Cell[]; lang: Lang; onOpen: (c: Cell) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? cells : cells.slice(0, 3);
  const more = cells.length - shown.length;
  return (
    <div className="chips">
      {shown.map((c, i) => (
        <button key={i} type="button" className="src-chip" onClick={() => onOpen(c)}>
          {docLabel(c, lang)}
        </button>
      ))}
      {more > 0 && (
        <button type="button" className="quiet small more-chips" onClick={() => setAll(true)}>
          {lang === "ar" ? `+ ${more} مصادر أخرى` : `+ ${more} more sources`}
        </button>
      )}
    </div>
  );
}

function ChatCard({
  card,
  canMarket,
  onSource,
  onRetry,
}: {
  card: Card;
  canMarket: boolean;
  onSource: (row: FactRow, item: string) => void;
  onRetry?: () => void;
}) {
  const ar = card.lang === "ar";
  const dir = ar ? "rtl" : "ltr";
  const allow = ar ? undefined : "";
  if (card.kind === "not_answered") {
    return (
      <div dir={dir} lang={card.lang} className="answer-slot" data-allow-en={allow}>
        <NotAnswered
          reason={card.text.replace(NOT_ANSWERED_PREFIX, "")}
          instead={
            card.reason === "server_error" && onRetry ? (
              <button className="btn" onClick={onRetry}>
                {RETRY[ar ? 1 : 0]}
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }
  if (card.kind === "clarify" || card.kind === "market_page") {
    return (
      <article className="card answer" dir={dir} lang={card.lang} data-allow-en={allow}>
        <ReadAsLine r={card.read_as} lang={card.lang} />
        <div className="eyebrow">{card.kind === "clarify" ? (ar ? "سؤال من رمح" : "Spear asks") : ar ? "السوق" : "Market"}</div>
        <p className="answer-text">{card.text}</p>
        {card.kind === "market_page" && canMarket && (
          <Link className="btn" to="/market">
            {ar ? "صفحة السوق" : "Market page"}
          </Link>
        )}
      </article>
    );
  }
  const figures = card.figures ?? [];
  const byRef = new Map(figures.map((f) => [f.ref, f]));
  const open = (f: Figure) => (c: Cell) => onSource(c, partsOf(f, card.lang).label);
  return (
    <article className="card answer chat-card" dir={dir} lang={card.lang} data-allow-en={allow}>
      <ReadAsLine r={card.read_as} lang={card.lang} />
      <p className="answer-text">
        {card.segments
          ? card.segments.map((s, i) => {
              const f = s.ref ? byRef.get(s.ref) : undefined;
              if (!f) return <span key={i}>{s.text}</span>;
              return <InlineFigure key={i} f={f} n={s.n} lang={card.lang} onSource={open(f)} />;
            })
          : card.text}
      </p>
      {figures.length > 0 && (
        <div className="fig-cards">
          {figures.map((f) => {
            const p = partsOf(f, card.lang);
            return (
              <div key={f.ref} className="fig-card">
                <span className="fig-n" aria-hidden="true">
                  {f.n}
                </span>
                {p.amount && <div className="fig-amount num">{p.amount}</div>}
                <div className="small">{p.label}</div>
                <Chips cells={f.cells} lang={card.lang} onOpen={open(f)} />
              </div>
            );
          })}
        </div>
      )}
      {(card.notes ?? []).map((n, i) => (
        <p key={i} className="small muted" style={{ margin: "6px 0 0" }}>
          {n}
        </p>
      ))}
      <p className="small muted" style={{ margin: "8px 0 0" }}>
        {ar ? "أرقام معتمدة، كتبها رمح وطابقها ببياناته" : "Signed-off figures, written by Spear and checked against its data"}
      </p>
    </article>
  );
}
