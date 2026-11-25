import { useEffect, useState } from "react";
import { PriceChart, type Bar } from "../components/PriceChart";
import { tool } from "../api";
import { day, percent } from "../format";
import { useLang } from "../i18n";
import { meta, nameOf, type Sector } from "../meta";
import {
  D,
  Loading,
  Notes,
  Panel,
  Price,
  SahmkFoot,
  SahmkLine,
  WhyNot,
  Working,
  docLabel,
  isAnswered,
} from "../components/Bits";
import type { Lang } from "../format";

// the two indices, by their full names; they come first in the suggestions
const INDICES: Record<string, { en: string; ar: string }> = {
  TASI: { en: "Tadawul All Share Index (TASI)", ar: "مؤشر السوق الرئيسية (تاسي)" },
  NOMU: { en: "Nomu Parallel Market Index (NOMU)", ar: "مؤشر السوق الموازية (نمو)" },
};
const isIndex = (sym: string) => sym in INDICES;

// the title: an index's full name; a company's name (the registry's, else SAHMK's) and its symbol
function titleOf(sym: string, found: any, sectors: Sector[], lang: Lang): string {
  if (isIndex(sym)) return INDICES[sym][lang];
  const reg = sectors.flatMap((x) => x.members).find((m) => m.symbol === sym);
  const name = reg ? nameOf(reg, lang) : companyName(found, sym, lang);
  return name && name !== sym ? `${name} · ${sym}` : sym;
}

function companyName(found: any, sym: string, lang: string): string {
  const list = Array.isArray(found?.data)
    ? found.data
    : (found?.data?.matches ?? []);
  const c = list.find((x: any) => x.symbol === sym) ?? list[0];
  if (!c) return sym;
  return (
    (lang === "ar" ? (c.name_ar ?? c.name_en) : (c.name_en ?? c.name_ar)) ?? sym
  );
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

// SAHMK data, owner-only until the owner turns the members' switch on (Mo, 25 Nov 2026).
// Every block says "Data provided by SAHMK"; returns are price returns, with both closes.
// SAHMK's dividend period ("H1", "ANNUAL") and fiscal year, in the reader's language
const PERIOD_AR: Record<string, string> = {
  ANNUAL: "سنوي",
  EXCEPTIONAL: "استثنائي",
  H1: "النصف الأول",
  H2: "النصف الثاني",
  Q1: "الربع الأول",
  Q2: "الربع الثاني",
  Q3: "الربع الثالث",
  Q4: "الربع الرابع",
};
const PERIOD_EN: Record<string, string> = {
  ANNUAL: "Annual",
  EXCEPTIONAL: "Exceptional",
};
function divPeriod(p: string | null, fy: string | null, lang: Lang): string {
  const name = p
    ? lang === "ar"
      ? (PERIOD_AR[p] ?? p)
      : (PERIOD_EN[p] ?? p)
    : null;
  return [name, fy].filter(Boolean).join(" ") || "—";
}

// the chart's ranges; the return card follows the one chosen
const RANGES = [
  { key: "1M", months: 1 },
  { key: "6M", months: 6 },
  { key: "1Y", months: 12 },
  { key: "5Y", months: 60 },
  { key: "Max", months: null },
] as const;
type RangeKey = "1M" | "6M" | "1Y" | "5Y" | "Max";
const RANGE_AR: Record<RangeKey, string> = {
  "1M": "شهر",
  "6M": "6 أشهر",
  "1Y": "سنة",
  "5Y": "5 سنوات",
  Max: "الكل",
};

function startOf(range: RangeKey, end: Date): string {
  const r = RANGES.find((x) => x.key === range)!;
  if (r.months === null) return "1990-01-01";
  const s = new Date(end);
  s.setUTCMonth(s.getUTCMonth() - r.months);
  return iso(s);
}

// every daily close in the range: the tool returns at most 2,000 rows a request, so a long range
// is asked in consecutive windows until the series is whole (none is sampled)
async function dailyCloses(
  symbol: string,
  start: string,
  end: string,
): Promise<any> {
  let first: any = null;
  const all: any[] = [];
  let from = start;
  for (let i = 0; i < 10; i++) {
    const r: any = await tool("get_prices", {
      symbol,
      start: from,
      end,
      interval: "1d",
    });
    if (!first) first = r;
    if (!Array.isArray(r?.data))
      return all.length ? { ...first, data: all } : r;
    all.push(...r.data);
    if (r.data.length < 2000) break;
    from = iso(
      new Date(
        Date.parse(r.data[r.data.length - 1].date + "T00:00:00Z") + 86_400_000,
      ),
    );
  }
  // the windows are whole now: the "first 2,000 rows" note no longer applies
  const reader_notes = (first.reader_notes ?? []).filter(
    (n: any) => !/^Only the first/.test(n.en),
  );
  return { ...first, data: all, reader_notes };
}

export function Market() {
  const { t, lang } = useLang();
  // a fresh visit opens on TASI; within the session, the last company viewed (Mo, 25 Nov 2026)
  const [sym, setSymState] = useState<string>(() => {
    try {
      return sessionStorage.getItem("spear.market") ?? "TASI";
    } catch {
      return "TASI";
    }
  });
  const setSym = (x: string) => {
    setSymState(x);
    try {
      sessionStorage.setItem("spear.market", x);
    } catch {
      /* storage may be unavailable */
    }
  };
  const [q, setQ] = useState("");
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [suggest, setSuggest] = useState<{ symbol: string; label: string }[]>([]);
  useEffect(() => {
    meta()
      .then((m) => setSectors(m.sectors))
      .catch(() => {});
  }, []);
  const [found, setFound] = useState<any>(null);
  const [prices, setPrices] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [divs, setDivs] = useState<any>(null);
  const [yld, setYld] = useState<any>(null);
  const [range, setRange] = useState<RangeKey>("1Y");
  const [table, setTable] = useState(false);

  const [searchMsg, setSearchMsg] = useState("");
  useEffect(() => {
    const k = q.trim();
    if (!k) {
      setSuggest([]);
      return;
    }
    const timer = setTimeout(async () => {
      const low = k.toLowerCase();
      const idx = Object.entries(INDICES)
        .filter(([code, n]) => code.toLowerCase().includes(low) || n.en.toLowerCase().includes(low) || n.ar.includes(k) || "index".includes(low) || "مؤشر".includes(k))
        .map(([code, n]) => ({ symbol: code, label: n[lang] }));
      const r: any = await tool("find_company", { query: k }).catch(() => null);
      const rows: any[] = Array.isArray(r?.data) ? r.data.slice(0, 8) : [];
      const companies = rows
        .filter((x) => x.security_type !== "Index")
        .map((x) => ({ symbol: x.symbol, label: titleOf(x.symbol, { data: [x] }, sectors, lang) }));
      const list = [...idx, ...companies];
      setSuggest(list);
      setSearchMsg(list.length ? "" : lang === "ar" ? `لا شركة ولا مؤشر يطابق «${k}».` : `No company or index matches "${k}".`);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, lang, sectors]);

  function choose(x: string) {
    setSuggest([]);
    setQ("");
    if (x === sym) setSearchMsg(lang === "ar" ? "معروض الآن." : "Already showing.");
    else {
      setSearchMsg("");
      setSym(x);
    }
  }
  function search() {
    if (suggest[0]) choose(suggest[0].symbol);
    else if (!q.trim()) setSearchMsg(lang === "ar" ? "اكتب اسم شركة أو رمزها، أو «تاسي» أو «نمو»." : "Type a company's name or symbol, or TASI or NOMU.");
  }

  useEffect(() => {
    tool("find_company", { query: sym })
      .then(setFound)
      .catch(() => {});
  }, [sym]);

  // the chart and the return card follow the range
  useEffect(() => {
    const end = new Date();
    const start = startOf(range, end);
    setPrices(null);
    setStats(null);
    dailyCloses(sym, start, iso(end))
      .then(setPrices)
      .catch(() => setPrices({ status: "error" }));
    tool("price_stats", { symbol: sym, start, end: iso(end) })
      .then(setStats)
      .catch(() => setStats({ status: "error" }));
  }, [sym, range]);

  useEffect(() => {
    const end = new Date();
    setDivs(null);
    setYld(null);
    if (isIndex(sym)) return;
    const s3 = new Date(end);
    s3.setFullYear(end.getFullYear() - 3);
    tool("get_dividends", { symbol: sym, start: iso(s3), end: iso(end) })
      .then(setDivs)
      .catch(() => setDivs({ status: "error" }));
    tool("dividend_stats", {
      symbol: sym,
      start: iso(end),
      end: iso(end),
      metric: "dividend_yield",
    })
      .then(setYld)
      .catch(() => setYld({ status: "error" }));
  }, [sym]);

  const rows = Array.isArray(prices?.data) ? prices.data : [];
  const s = stats?.data;
  const y = yld?.data;
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">{t.market}</span>
          <h1 className="title">{titleOf(sym, found, sectors, lang)}</h1>
          {rows.length > 0 && (
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              {lang === "ar" ? "الأسعار حتى إغلاق " : "Prices as of the close of "}
              <D>{day(rows[rows.length - 1].date, lang)}</D>
            </p>
          )}
          {sym !== "TASI" && (
            <button type="button" className="linklike small" onClick={() => choose("TASI")}>
              {lang === "ar" ? "→ العودة إلى تاسي" : "← Back to TASI"}
            </button>
          )}
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            {t.marketOwnerOnly}
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
          style={{ display: "flex", gap: 8 }}
        >
          <div className="suggest-wrap">
            <input
              aria-label={lang === "ar" ? "شركة أو مؤشر" : "Company or index"}
              placeholder={lang === "ar" ? "شركة أو مؤشر، بالاسم أو الرمز" : "Company or index, by name or symbol"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 260 }}
              dir="auto"
              role="combobox"
              aria-expanded={suggest.length > 0}
              aria-controls="market-suggest"
              autoComplete="off"
            />
            {suggest.length > 0 && (
              <ul className="results suggest" id="market-suggest" role="listbox">
                {suggest.map((x) => (
                  <li key={x.symbol}>
                    <button type="button" role="option" aria-selected={x.symbol === sym} onClick={() => choose(x.symbol)}>
                      <span>{x.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="primary" type="submit">
            {t.show}
          </button>
        </form>
        {searchMsg && (
          <p className="small muted" role="status" style={{ flexBasis: "100%", margin: 0, textAlign: "end" }}>
            {searchMsg}
          </p>
        )}
      </div>

      <div className="chart-row" style={{ marginBottom: "var(--space-3)" }}>
        <Panel>
          {() => (
            <>
              <div className="panel-head chart-head">
                <h2 className="heading">{lang === "ar" ? "السعر" : "Price"}</h2>
                <div
                  className="seg ranges"
                  role="group"
                  aria-label={lang === "ar" ? "المدى" : "Range"}
                >
                  {RANGES.map((r) => (
                    <button
                      key={r.key}
                      className={range === r.key ? "on" : ""}
                      aria-pressed={range === r.key}
                      onClick={() => setRange(r.key)}
                    >
                      {lang === "ar" ? RANGE_AR[r.key] : r.key}
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel-body">
                {!prices ? (
                  <Loading />
                ) : isAnswered(prices) && rows.length > 1 ? (
                  <>
                    <PriceChart rows={rows as Bar[]} />
                    <SahmkLine res={prices} />
                    <button
                      type="button"
                      className="linklike small"
                      onClick={() => setTable(!table)}
                      aria-expanded={table}
                    >
                      {table
                        ? lang === "ar"
                          ? "إخفاء الجدول"
                          : "Hide the table"
                        : lang === "ar"
                          ? "عرض كجدول"
                          : "View as table"}
                    </button>
                    {table && (
                      <div className="close-table">
                        <table>
                          <thead>
                            <tr>
                              <th>{lang === "ar" ? "التاريخ" : "Date"}</th>
                              <th className="fig">
                                {lang === "ar" ? "الإغلاق" : "Close"}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...rows].reverse().map((r: any) => (
                              <tr key={r.date}>
                                <td>
                                  <D>{day(r.date, lang)}</D>
                                </td>
                                <td className="fig">
                                  <Price v={r.close} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <WhyNot res={prices} />
                )}
              </div>
            </>
          )}
        </Panel>
        <Panel>
          {() => (
            <>
              <div className="panel-head">
                <h2 className="heading">
                  {t.priceReturn} · {lang === "ar" ? RANGE_AR[range] : range}
                </h2>
              </div>
              <div className="panel-body">
                {!stats ? (
                  <Loading />
                ) : isAnswered(stats) && s ? (
                  <>
                    <div
                      className="figure-xl"
                      style={{ fontSize: 40, lineHeight: "48px" }}
                    >
                      <bdi
                        className={`num ${String(s.price_return).startsWith("-") ? "neg" : ""}`}
                      >
                        {percent(s.price_return, true)}
                      </bdi>
                    </div>
                    <p className="basis small">
                      {lang === "ar"
                        ? "عائد سعري، من إغلاق "
                        : "Price return, from the close of "}
                      <Price v={s.return_start_close?.close} />
                      {lang === "ar" ? " في " : " on "}
                      <D>{day(s.return_start_close?.date, lang)}</D>
                      {lang === "ar" ? " إلى إغلاق " : " to the close of "}
                      <Price v={s.return_end_close?.close} />
                      {lang === "ar" ? " في " : " on "}
                      <D>{day(s.return_end_close?.date, lang)}</D>
                      {lang === "ar"
                        ? "؛ أسعار معدّلة من سهمك."
                        : "; SAHMK-adjusted prices."}
                    </p>
                    <Working>
                      <dl className="kv">
                        <dt>{t.from}</dt>
                        <dd>
                          <Price v={s.return_start_close?.close} /> ·{" "}
                          <D>{day(s.return_start_close?.date, lang)}</D>
                        </dd>
                        <dt>{t.to}</dt>
                        <dd>
                          <Price v={s.return_end_close?.close} /> ·{" "}
                          <D>{day(s.return_end_close?.date, lang)}</D>
                        </dd>
                        <dt>{lang === "ar" ? "الصيغة" : "Formula"}</dt>
                        <dd>
                          {lang === "ar"
                            ? "إغلاق النهاية ÷ إغلاق البداية − 1، حسبتها تحليلات رمح"
                            : "end close ÷ start close − 1, computed by Spear"}
                        </dd>
                        <dt>{t.volatility}</dt>
                        <dd>
                          <bdi className="num">
                            {percent(s.volatility_annualised, true)}
                          </bdi>
                        </dd>
                        <dt>{t.drawdown}</dt>
                        <dd>
                          <bdi className="num neg">
                            {percent(s.max_drawdown, true)}
                          </bdi>
                        </dd>
                      </dl>
                      <Notes res={stats} />
                    </Working>
                    <SahmkLine res={stats} />
                  </>
                ) : (
                  <WhyNot res={stats} />
                )}
              </div>
            </>
          )}
        </Panel>
      </div>

      {!isIndex(sym) && (
      <div className="grid-2">
        <Panel>
          {() => (
            <>
              <div className="panel-head">
                <h2 className="heading">{t.dividends}</h2>
              </div>
              {!divs ? (
                <div className="panel-body">
                  <Loading />
                </div>
              ) : isAnswered(divs) && Array.isArray(divs.data) ? (
                <>
                  <div className="scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{t.recordDate}</th>
                          <th>{t.period}</th>
                          <th className="fig">{t.perShare}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {divs.data
                          .filter((r: any) => r.kind === "history")
                          .slice(-8)
                          .reverse()
                          .map((r: any, i: number) => (
                            <tr key={i} className={r.excluded ? "muted" : ""}>
                              <td>
                                <D>{day(r.eligibility_date, lang)}</D>
                              </td>
                              <td className="small">
                                {divPeriod(r.period, r.fiscal_year, lang)}
                                {r.status === "conflict"
                                  ? lang === "ar"
                                    ? " · متعارض"
                                    : " · conflict"
                                  : ""}
                                {r.excluded
                                  ? lang === "ar"
                                    ? " · مستبعد (مكرر)"
                                    : " · excluded (duplicate)"
                                  : ""}
                              </td>
                              <td className="fig">
                                <Price v={r.value} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="panel-body">
                    <SahmkLine res={divs} />
                    <Notes res={divs} />
                  </div>
                </>
              ) : (
                <div className="panel-body">
                  <WhyNot res={divs} />
                </div>
              )}
            </>
          )}
        </Panel>
        <Panel>
          {() => (
            <>
              <div className="panel-head">
                <h2 className="heading">{t.dividendYield}</h2>
              </div>
              <div className="panel-body">
                {!yld ? (
                  <Loading />
                ) : isAnswered(yld) && y ? (
                  <>
                    <div
                      className="figure-xl"
                      style={{ fontSize: 40, lineHeight: "48px" }}
                    >
                      <bdi className="num">{y.dividend_yield_percent}%</bdi>
                    </div>
                    <p className="basis small">
                      {lang === "ar"
                        ? "توزيعات اثني عشر شهرًا "
                        : "Twelve months' dividends, "}
                      <Price v={y.dividends_total} />
                      {lang === "ar"
                        ? " ر.س، على إغلاق "
                        : " SAR, over the close of "}
                      <Price v={y.close} />
                      {lang === "ar" ? " في " : " on "}
                      <D>{day(y.close_date, lang)}</D>
                      {lang === "ar"
                        ? "؛ أساس عوائد الأسعار: معدّلة من سهمك."
                        : "; price return basis: SAHMK-adjusted."}
                    </p>
                    <Working>
                      {Array.isArray(y.dividends) && y.dividends.length > 0 && (
                        <div className="scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>{t.recordDate}</th>
                                <th className="fig">{t.perShare}</th>
                                <th className="fig">
                                  {lang === "ar" ? "المعامل" : "Factor"}
                                </th>
                                <th className="fig">
                                  {lang === "ar"
                                    ? "على أساس السعر"
                                    : "On the price basis"}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {y.dividends.map((r: any, i: number) => (
                                <tr key={i}>
                                  <td>
                                    <D>{day(r.record_date, lang)}</D>
                                  </td>
                                  <td className="fig">
                                    <Price v={r.value} />
                                  </td>
                                  <td className="fig">
                                    <bdi className="num">{r.factor ?? "—"}</bdi>
                                  </td>
                                  <td className="fig">
                                    <Price
                                      v={r.value_on_price_basis ?? r.value}
                                    />
                                  </td>
                                </tr>
                              ))}
                              <tr className="total">
                                <td>{t.total}</td>
                                <td />
                                <td />
                                <td className="fig">
                                  <Price v={y.dividends_total} />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                      <dl className="kv">
                        <dt>{lang === "ar" ? "الإغلاق" : "Close"}</dt>
                        <dd>
                          <Price v={y.close} /> ·{" "}
                          <D>{day(y.close_date, lang)}</D>
                        </dd>
                        <dt>{lang === "ar" ? "الصيغة" : "Formula"}</dt>
                        <dd>
                          {lang === "ar"
                            ? "مجموع التوزيعات ÷ الإغلاق × 100، حسبتها تحليلات رمح"
                            : "dividends total ÷ close × 100, computed by Spear"}
                        </dd>
                        {(y.factors ?? []).map((f: any, i: number) => (
                          <div key={i} style={{ display: "contents" }}>
                            <dt>
                              {lang === "ar"
                                ? "تغيّر رأس المال"
                                : "Capital change"}
                            </dt>
                            <dd>
                              {lang === "ar"
                                ? (f.event_text?.ar ?? f.event)
                                : f.event}
                              {lang === "ar" ? "، اعتُمد في " : ", approved "}
                              <D>{day(f.approved, lang)}</D>
                              {lang === "ar" ? "، المعامل " : ", factor "}
                              <bdi className="num">{f.factor}</bdi>
                              {" · "}
                              {docLabel(f, lang)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <Notes res={yld} />
                    </Working>
                    <SahmkLine res={yld} />
                  </>
                ) : (
                  <WhyNot res={yld} />
                )}
              </div>
            </>
          )}
        </Panel>
      </div>
      )}
      <SahmkFoot res={[prices, stats, divs, yld]} />
    </>
  );
}
