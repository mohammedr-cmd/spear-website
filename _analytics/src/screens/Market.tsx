import { useEffect, useState } from "react";
import { tool } from "../api";
import { day, percent } from "../format";
import { useLang } from "../i18n";
import { D, isAnswered, Loading, Notes, Price, SahmkLine, WhyNot, Working } from "../components/Bits";
import type { Lang } from "../format";
import { price } from "../format";

function companyName(found: any, sym: string, lang: string): string {
  const list = Array.isArray(found?.data) ? found.data : found?.data?.matches ?? [];
  const c = list.find((x: any) => x.symbol === sym) ?? list[0];
  if (!c) return sym;
  return (lang === "ar" ? c.name_ar ?? c.name_en : c.name_en ?? c.name_ar) ?? sym;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function Chart({ rows, lang }: { rows: { date: string; close: string }[]; lang: Lang }) {
  if (rows.length < 2) return null;
  const c = rows.map((r) => Number(r.close));
  const min = Math.min(...c);
  const max = Math.max(...c);
  const w = 720;
  const h = 220;
  const pad = 8;
  const x = (i: number) => pad + (i / (rows.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - 24 - ((v - min) / (max - min || 1)) * (h - 48);
  const pts = c.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} direction="ltr" style={{ width: "100%", height: "auto", display: "block", direction: "ltr" }} role="img" aria-label="Price chart">
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={y(min + f * (max - min))} y2={y(min + f * (max - min))} stroke="var(--line)" strokeWidth="1" />
      ))}
      <line x1={pad} x2={w - pad} y1={h - 24} y2={h - 24} stroke="var(--line-strong)" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      <text x={pad} y={h - 6} fontSize="11" fill="var(--ink-muted)" fontFamily="var(--font-sans)">{day(rows[0].date, lang)}</text>
      <text x={w - pad} y={h - 6} fontSize="11" fill="var(--ink-muted)" textAnchor="end" fontFamily="var(--font-sans)">{day(rows[rows.length - 1].date, lang)}</text>
      <text x={w - pad} y={y(c[c.length - 1]) - 6} fontSize="12" fill="var(--ink)" textAnchor="end" fontFamily="var(--font-sans)">{price(rows[rows.length - 1].close)}</text>
    </svg>
  );
}

// SAHMK data, owner-only until the owner turns the members' switch on (Mo, 25 Nov 2026).
// Every block says "Data provided by SAHMK"; returns are price returns, with both closes.
export function Market() {
  const { t, lang } = useLang();
  const [q, setQ] = useState("1180");
  const [sym, setSym] = useState("1180");
  const [found, setFound] = useState<any>(null);
  const [prices, setPrices] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [divs, setDivs] = useState<any>(null);
  const [yld, setYld] = useState<any>(null);

  async function search() {
    const r = await tool("find_company", { query: q }).catch(() => null);
    const first = r?.data?.[0] ?? r?.data?.matches?.[0];
    setFound(r);
    if (first?.symbol) setSym(first.symbol);
  }

  useEffect(() => {
    tool("find_company", { query: sym }).then(setFound).catch(() => {});
  }, [sym]);

  useEffect(() => {
    const end = new Date();
    const start = new Date(end);
    start.setFullYear(end.getFullYear() - 1);
    setPrices(null);
    setStats(null);
    setDivs(null);
    setYld(null);
    tool("get_prices", { symbol: sym, start: iso(start), end: iso(end), interval: "1w" }).then(setPrices).catch(() => setPrices({ status: "error" }));
    tool("price_stats", { symbol: sym, period: "ytd" }).then(setStats).catch(() => setStats({ status: "error" }));
    const s3 = new Date(end);
    s3.setFullYear(end.getFullYear() - 3);
    tool("get_dividends", { symbol: sym, start: iso(s3), end: iso(end) }).then(setDivs).catch(() => setDivs({ status: "error" }));
    tool("dividend_stats", { symbol: sym, start: iso(end), end: iso(end), metric: "dividend_yield" }).then(setYld).catch(() => setYld({ status: "error" }));
  }, [sym]);

  const rows = Array.isArray(prices?.data) ? prices.data : [];
  const s = stats?.data;
  const y = yld?.data;
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">{t.market}</span>
          <h1 className="title">{companyName(found, sym, lang)}</h1>
          <p className="small muted" style={{ margin: "6px 0 0" }}>{t.marketOwnerOnly}</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); search(); }} style={{ display: "flex", gap: 8 }}>
          <input aria-label={t.symbol} placeholder={t.symbol} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} dir="auto" />
          <button className="primary" type="submit">{t.show}</button>
        </form>
      </div>

      <div className="grid-2" style={{ marginBottom: "var(--space-3)" }}>
        <section className="panel">
          <div className="panel-head"><h2 className="heading">{lang === "ar" ? "السعر، آخر اثني عشر شهرًا" : "Price, last 12 months"}</h2></div>
          <div className="panel-body">
            {!prices ? <Loading /> : isAnswered(prices) ? <><Chart rows={rows} lang={lang} /><SahmkLine res={prices} /></> : <WhyNot res={prices} />}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2 className="heading">{t.priceReturn} · <bdi className="num">{new Date().getFullYear()}</bdi></h2></div>
          <div className="panel-body">
            {!stats ? (
              <Loading />
            ) : isAnswered(stats) && s ? (
              <>
                <div className="figure-xl" style={{ fontSize: 40, lineHeight: "48px" }}>
                  <bdi className={`num ${String(s.price_return).startsWith("-") ? "neg" : ""}`}>{percent(s.price_return, true)}</bdi>
                </div>
                <p className="basis small">
                  {lang === "ar" ? "عائد سعري، من إغلاق " : "Price return, from the close of "}
                  <D>{day(s.return_start_close?.date, lang)}</D>
                  {lang === "ar" ? " إلى إغلاق " : " to the close of "}
                  <D>{day(s.return_end_close?.date, lang)}</D>
                  {lang === "ar" ? "؛ أسعار معدّلة من سهمك." : "; SAHMK-adjusted prices."}
                </p>
                <Working>
                  <dl className="kv">
                    <dt>{t.from}</dt>
                    <dd><Price v={s.return_start_close?.close} /> · <D>{day(s.return_start_close?.date, lang)}</D></dd>
                    <dt>{t.to}</dt>
                    <dd><Price v={s.return_end_close?.close} /> · <D>{day(s.return_end_close?.date, lang)}</D></dd>
                    <dt>{lang === "ar" ? "الصيغة" : "Formula"}</dt>
                    <dd>{lang === "ar" ? "إغلاق النهاية ÷ إغلاق البداية − 1، حسبتها تحليلات رمح" : "end close ÷ start close − 1, computed by Spear"}</dd>
                    <dt>{t.volatility}</dt>
                    <dd><bdi className="num">{percent(s.volatility_annualised, true)}</bdi></dd>
                    <dt>{t.drawdown}</dt>
                    <dd><bdi className="num neg">{percent(s.max_drawdown, true)}</bdi></dd>
                  </dl>
                  <Notes res={stats} />
                </Working>
                <SahmkLine res={stats} />
              </>
            ) : (
              <WhyNot res={stats} />
            )}
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2 className="heading">{t.dividends}</h2></div>
          {!divs ? (
            <div className="panel-body"><Loading /></div>
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
                    {divs.data.filter((r: any) => r.kind === "history").slice(-8).reverse().map((r: any, i: number) => (
                      <tr key={i} className={r.excluded ? "muted" : ""}>
                        <td><D>{day(r.eligibility_date, lang)}</D></td>
                        <td className="small ltr-block" lang="en">
                          {[r.period, r.fiscal_year].filter(Boolean).join(" ") || "—"}
                          {r.status === "conflict" ? " · conflict" : ""}
                          {r.excluded ? " · excluded (duplicate)" : ""}
                        </td>
                        <td className="fig"><Price v={r.value} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel-body"><SahmkLine res={divs} /><Notes res={divs} /></div>
            </>
          ) : (
            <div className="panel-body"><WhyNot res={divs} /></div>
          )}
        </section>
        <section className="panel">
          <div className="panel-head"><h2 className="heading">{t.dividendYield}</h2></div>
          <div className="panel-body">
            {!yld ? (
              <Loading />
            ) : isAnswered(yld) && y ? (
              <>
                <div className="figure-xl" style={{ fontSize: 40, lineHeight: "48px" }}>
                  <bdi className="num">{y.dividend_yield_percent}%</bdi>
                </div>
                <p className="basis small">
                  {lang === "ar" ? "توزيعات اثني عشر شهرًا " : "Twelve months' dividends, "}
                  <Price v={y.dividends_total} />
                  {lang === "ar" ? " ر.س، على إغلاق " : " SAR, over the close of "}
                  <Price v={y.close} />
                  {lang === "ar" ? " في " : " on "}
                  <D>{day(y.close_date, lang)}</D>
                  {lang === "ar" ? "؛ أساس عوائد الأسعار: معدّلة من سهمك." : "; price return basis: SAHMK-adjusted."}
                </p>
                <Working>
                  {Array.isArray(y.dividends) && y.dividends.length > 0 && (
                    <div className="scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>{t.recordDate}</th>
                            <th className="fig">{t.perShare}</th>
                            <th className="fig">{lang === "ar" ? "المعامل" : "Factor"}</th>
                            <th className="fig">{lang === "ar" ? "على أساس السعر" : "On the price basis"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {y.dividends.map((r: any, i: number) => (
                            <tr key={i}>
                              <td><D>{day(r.record_date, lang)}</D></td>
                              <td className="fig"><Price v={r.value} /></td>
                              <td className="fig"><bdi className="num">{r.factor ?? "—"}</bdi></td>
                              <td className="fig"><Price v={r.value_on_price_basis ?? r.value} /></td>
                            </tr>
                          ))}
                          <tr className="total">
                            <td>{t.total}</td>
                            <td />
                            <td />
                            <td className="fig"><Price v={y.dividends_total} /></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  <dl className="kv">
                    <dt>{lang === "ar" ? "الإغلاق" : "Close"}</dt>
                    <dd><Price v={y.close} /> · <D>{day(y.close_date, lang)}</D></dd>
                    <dt>{lang === "ar" ? "الصيغة" : "Formula"}</dt>
                    <dd>{lang === "ar" ? "مجموع التوزيعات ÷ الإغلاق × 100، حسبتها تحليلات رمح" : "dividends total ÷ close × 100, computed by Spear"}</dd>
                    {(y.factors ?? []).map((f: any, i: number) => (
                      <div key={i} style={{ display: "contents" }}>
                        <dt>{lang === "ar" ? "تغيّر رأس المال" : "Capital change"}</dt>
                        <dd className="ltr-block" lang="en">
                          {f.event}, approved {day(f.approved, "en")}, factor {f.factor} · {f.document}, page {f.page}
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
        </section>
      </div>
    </>
  );
}
