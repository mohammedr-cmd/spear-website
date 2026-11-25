import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { tool } from "../api";
import { day, unit, type Lang } from "../format";
import { useLang } from "../i18n";
import { meta, nameOf, type Sector } from "../meta";
import { Fig, NotAnswered } from "../components/Bits";
import { SourcePanel, type FactRow } from "../components/SourcePanel";
import type { Me } from "../App";

// Chat, a full page: earlier questions by day in a side column (a drawer at phone width), each
// question as a dark bubble, each answer as a card with its main figure large and its sources,
// a refusal as its own "Not answered" card, and the ask box fixed at the bottom. The model is
// connected in build step 4 and stays off until it passes the benchmark gate (docs/web-ui.md
// section 6.2): until the API says chat is on, the page shows that plainly.

type Answer = {
  kind: "answer";
  lang: Lang;
  row: FactRow;
  item: string;
  company: string;
  sentence: string;
};
type Refusal = { kind: "refusal"; lang: Lang; reason: string; instead: string };
type Exchange = { q: string; a: Answer | Refusal | null };
type Past = { q: string; at: string };

const ARABIC = /[؀-ۿ]/;
// an Arabic question gets an Arabic answer, right to left, whatever the page's language
export const answerLang = (q: string): Lang => (ARABIC.test(q) ? "ar" : "en");

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function latest(rows: FactRow[], code: string): FactRow | null {
  return rows.filter((r) => r.line_item_code === code).sort((a, b) => (a.period_end < b.period_end ? 1 : -1))[0] ?? null;
}

export function Chat({ me }: { me: Me }) {
  const { t, lang } = useLang();
  const [params] = useSearchParams();
  const asked = params.get("q") ?? "";
  // development only: the page's layout with real figures, for Mo's review (never in the built site)
  const preview = import.meta.env.DEV && params.get("preview") === "1";
  const [live, setLive] = useState(false);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [thread, setThread] = useState<Exchange[]>([]);
  const [past, setPast] = useState<Past[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [src, setSrc] = useState<{ row: FactRow; item: string } | null>(null);
  const [q, setQ] = useState(asked);

  useEffect(() => {
    meta()
      .then((m: any) => {
        setSectors(m.sectors);
        setLive(Boolean(m.chat?.on));
      })
      .catch(() => {});
  }, []);

  // the preview's exchanges: real figures from the tool layer, sentences written for the preview
  useEffect(() => {
    if (!preview || !sectors.length) return;
    const banks = sectors[0];
    const itemName = (code: string, l: Lang) => nameOf(banks.items.find((i) => i.code === code), l, code);
    const coName = (sym: string, l: Lang) => nameOf(banks.members.find((m) => m.symbol === sym), l, sym);
    Promise.all([
      tool("get_financials", { symbol: "1180", statement: "BS" }),
      tool("get_financials", { symbol: "1010", statement: "BS" }),
    ])
      .then(([a, b]) => {
        const ta = latest(a.data ?? [], "total_assets");
        const cd = latest(b.data ?? [], "customer_deposits");
        const mk = (row: FactRow | null, sym: string, code: string, l: Lang, sentence: (r: FactRow) => string): Answer | null =>
          row ? { kind: "answer", lang: l, row, item: itemName(code, l), company: coName(sym, l), sentence: sentence(row) } : null;
        const en = lang === "en";
        const q1 = en ? "What were SNB's total assets at the latest quarter end?" : "ما إجمالي موجودات البنك الأهلي السعودي في آخر ربع؟";
        const q2 = en ? "ما إجمالي ودائع العملاء لبنك الرياض في آخر ربع؟" : "What were Riyad Bank's customer deposits at the latest quarter end?";
        const q3 = en ? "What is Al Rajhi's dividend yield?" : "ما عائد التوزيعات لمصرف الراجحي؟";
        const l1 = answerLang(q1);
        const l2 = answerLang(q2);
        const l3 = answerLang(q3);
        setThread([
          {
            q: q1,
            a: mk(ta, "1180", "total_assets", l1, (r) =>
              l1 === "ar"
                ? `بلغ إجمالي موجودات البنك الأهلي السعودي في ${day(r.period_end, "ar")} الرقم المبيّن بآلاف الريالات، كما ورد في قوائمه المعتمدة.`
                : `SNB's total assets at ${day(r.period_end, "en")}, in SAR thousands, as printed in its signed-off statements.`,
            ),
          },
          {
            q: q2,
            a: mk(cd, "1010", "customer_deposits", l2, (r) =>
              l2 === "ar"
                ? `بلغت ودائع العملاء لبنك الرياض في ${day(r.period_end, "ar")} الرقم المبيّن بآلاف الريالات، كما ورد في قوائمه المعتمدة.`
                : `Riyad Bank's customer deposits at ${day(r.period_end, "en")}, in SAR thousands, as printed in its signed-off statements.`,
            ),
          },
          {
            q: q3,
            a: {
              kind: "refusal",
              lang: l3,
              reason:
                l3 === "ar"
                  ? "بيانات الأسعار والتوزيعات وعوائدها من سهمك غير متاحة في المحادثة؛ تجدها في صفحة السوق."
                  : "SAHMK price, dividend and yield data isn't available in chat; it's on the Market page.",
              instead:
                l3 === "ar"
                  ? "عن قوائم مصرف الراجحي المالية، مثل صافي دخله لعام 2025."
                  : "about Al Rajhi's statements, for example its net income for 2025.",
            },
          },
        ]);
        setPast([
          { q: q1, at: todayIso() },
          { q: q2, at: todayIso() },
          { q: q3, at: todayIso() },
          { q: en ? "Compare loans to deposits for four banks at 30 June 2026" : "قارن نسبة القروض إلى الودائع لأربعة بنوك في 30 يونيو 2026", at: daysAgo(1) },
          { q: en ? "Alinma's net income for 2025" : "صافي دخل مصرف الإنماء لعام 2025", at: daysAgo(1) },
        ]);
      })
      .catch(() => {});
  }, [preview, sectors, lang]);

  // the thread opens at its first exchange; a new answer scrolls the thread, never the page
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = threadRef.current;
    if (el && thread.length && !preview) el.scrollTop = el.scrollHeight;
  }, [thread, preview]);

  const on = live || preview;
  const groups = past.reduce<{ label: string; items: Past[] }[]>((acc, p) => {
    const label = p.at === todayIso() ? t.today : day(p.at, lang);
    const g = acc.find((x) => x.label === label);
    if (g) g.items.push(p);
    else acc.push({ label, items: [p] });
    return acc;
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    // the model client arrives in build step 4; nothing is sent until then
  }

  return (
    <div className="chat-page">
      <aside className={`history ${drawer ? "open" : ""}`} aria-label={t.earlier}>
        <div className="history-head">
          <button
            className="primary new-q"
            disabled={!on}
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
                  <li key={i} dir="auto" lang={answerLang(p.q)}>
                    {p.q}
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
        </div>
        <div className="thread" ref={threadRef}>
          {!on ? (
            <div className="chat-off">
              <span className="eyebrow">{t.chat}</span>
              <h1 className="title">{t.chatOff}</h1>
              <p>{t.chatOffBody}</p>
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
            <>
              {preview && <p className="notice small">{t.previewNote}</p>}
              {thread.map((x, i) => (
                <div key={i} className="exchange">
                  <div className="bubble" dir="auto" lang={answerLang(x.q)}>
                    {x.q}
                  </div>
                  {x.a?.kind === "answer" && <AnswerCard a={x.a} onSource={(row, item) => setSrc({ row, item })} />}
                  {x.a?.kind === "refusal" && (
                    <div dir={x.a.lang === "ar" ? "rtl" : "ltr"} lang={x.a.lang} className="answer-slot">
                      <NotAnswered
                        reason={x.a.reason}
                        instead={
                          <>
                            <strong>{x.a.lang === "ar" ? "اسأل بدلًا من ذلك" : "Ask instead"}: </strong>
                            {x.a.instead}
                          </>
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </>
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
              disabled={!live}
            />
            <button className="primary" type="submit" disabled={!live || !q.trim()}>
              {t.ask}
            </button>
          </div>
          <p className="small muted signed-line">{t.signedOffLine}</p>
        </form>
      </section>

      {src && (
        <div className="chat-source">
          <SourcePanel row={src.row} itemName={src.item} isOwner={me.role === "owner"} onClose={() => setSrc(null)} />
        </div>
      )}
    </div>
  );
}

// An answer: what it is, the figure large, a sentence or two, and its sources. In the question's
// language, whatever the page's.
function AnswerCard({ a, onSource }: { a: Answer; onSource: (row: FactRow, item: string) => void }) {
  const ar = a.lang === "ar";
  return (
    <article className="card answer" dir={ar ? "rtl" : "ltr"} lang={a.lang}>
      <div className="eyebrow">
        {a.item} · {a.company} · {ar ? <span>{day(a.row.period_end, "ar")}</span> : <bdi className="num">{day(a.row.period_end, "en")}</bdi>}
      </div>
      <div className="answer-figure">
        <span className="figure-xl">
          <Fig v={a.row.value} />
        </span>
        <span className="small muted">{unit(a.row.scale, false, a.lang)}</span>
      </div>
      <p className="answer-text">{a.sentence}</p>
      <div className="answer-sources">
        <button type="button" className="btn srcbtn" onClick={() => onSource(a.row, a.item)}>
          {ar ? "المصدر" : "Source"}: <bdi lang="en">{a.row.document}</bdi>, {ar ? "صفحة" : "page"} <bdi className="num">{a.row.page}</bdi>
        </button>
        <Link className="btn srcbtn" to={`/statements/${a.row.document.split("_")[0]}`}>
          {ar ? "القائمة كاملة" : "Full statement"}
        </Link>
      </div>
      <p className="small muted" style={{ margin: "8px 0 0" }}>
        {ar ? "رقم معتمد، كما ورد في القوائم" : "Signed-off figure, as printed"}
      </p>
    </article>
  );
}
