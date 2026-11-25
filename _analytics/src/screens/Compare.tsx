import { useEffect, useState } from "react";
import { get, tool } from "../api";
import { day, percent } from "../format";
import { useLang } from "../i18n";
import { meta, nameOf, type Sector } from "../meta";
import { Fig, Loading, Notes, Price, ScrollCue, WhyNot } from "../components/Bits";
import { CompanyPicker } from "../components/CompanyPicker";

const PERIODS = ["2026-09-30", "2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2024-12-31", "2023-12-31"];

// Two or more companies of one sector side by side for one period, through the compare tool. The
// line items and ratios offered are the sector's own (the registry); ratios are computed by Spear
// with their formula, with coverage ("8 of 10 companies") and each cell's notes.
export function Compare() {
  const { t, lang } = useLang();
  const [sectors, setSectors] = useState<Sector[] | null>(null);
  const [sectorKey, setSectorKey] = useState<string>("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [pe, setPe] = useState(PERIODS[0]);
  const [items, setItems] = useState<string[]>([]);
  const [ratios, setRatios] = useState<string[]>([]);
  const [months, setMonths] = useState<number | "">("");
  const [total, setTotal] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<string[]>([]);
  const [ready, setReady] = useState("");

  const sector = sectors?.find((s) => s.key === sectorKey);

  function pickSector(s: Sector) {
    setSectorKey(s.key);
    setChosen(s.members.slice(0, 4).map((m) => m.symbol));
    // start with four companies that have signed-off statements for the latest period, in the registry's order
    get<{ companies: { symbol: string; latest_signed_off_period: string | null }[] }>(
      `/dashboard?sector=${encodeURIComponent(s.key)}`,
    )
      .then((d) => {
        // signed off up to the period shown
        const covered = new Set(
          d.companies.filter((c) => (c.latest_signed_off_period ?? "") >= PERIODS[0]).map((c) => c.symbol),
        );
        const first = s.members.filter((m) => covered.has(m.symbol)).slice(0, 4).map((m) => m.symbol);
        if (first.length >= 2) setChosen(first);
        setReady(s.key);
      })
      .catch(() => setReady(s.key));
    setItems(s.compare_items.slice(0, 4));
    setRatios(s.ratios.slice(0, 2).map((r) => r.code));
    setRes(null);
  }

  useEffect(() => {
    meta()
      .then((m) => {
        setSectors(m.sectors);
        if (m.sectors[0]) pickSector(m.sectors[0]);
      })
      .catch(() => setSectors([]));
  }, []);

  async function run(symbols = chosen, its = items, rs = ratios) {
    if (symbols.length < 2) return;
    setBusy(true);
    try {
      setShown(symbols);
      setRes(await tool("compare", { symbols, items: its, period_end: pe, ratios: rs, total, ...(months ? { months } : {}) }));
    } catch {
      setRes({ status: "error" });
    } finally {
      setBusy(false);
    }
  }
  // the first comparison runs once the sector's defaults are set
  useEffect(() => {
    if (sector && ready === sector.key && !res && chosen.length >= 2) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const companyName = (s: string) => nameOf(sector?.members.find((x) => x.symbol === s), lang, s);
  const item = (c: string) => sector?.items.find((x) => x.code === c);
  const ratio = (c: string) => sector?.ratios.find((x) => x.code === c);
  const d = res?.data;
  const marks = (v: any) =>
    [v?.includes && `${t.includes}: ${v.includes}`, v?.restated && t.restated, v?.reports_differ && t.reportsDiffer].filter(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            {t.compare}
            {sector ? ` · ${nameOf(sector, lang)}` : ""}
          </span>
          <h1 className="title">{t.compare}</h1>
        </div>
      </div>
      <section className="panel" style={{ marginBottom: "var(--space-3)" }}>
        <div className="panel-body" style={{ display: "grid", gap: 16 }}>
          {!sectors || !sector ? (
            <Loading />
          ) : (
            <>
              <CompanyPicker
                sectors={sectors}
                sector={sector.key}
                onSector={(k) => {
                  const s = sectors.find((x) => x.key === k);
                  if (s) pickSector(s);
                }}
                selected={chosen}
                onToggle={(s) => toggle(chosen, setChosen, s)}
                multi
              />
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
                <div>
                  <label htmlFor="pe">{t.period}</label>
                  <select id="pe" value={pe} onChange={(e) => setPe(e.target.value)} style={{ width: "auto" }}>
                    {PERIODS.map((p) => (
                      <option key={p} value={p}>
                        {day(p, lang)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="months">{lang === "ar" ? "أشهر قائمة الدخل" : "Income-statement months"}</label>
                  <select
                    id="months"
                    value={months}
                    onChange={(e) => setMonths(e.target.value ? Number(e.target.value) : "")}
                    style={{ width: "auto" }}
                  >
                    <option value="">—</option>
                    {[3, 6, 9, 12].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", margin: 0, color: "var(--ink)" }}>
                  <input type="checkbox" checked={total} onChange={(e) => setTotal(e.target.checked)} style={{ width: "auto" }} />
                  {t.total}
                </label>
                <button className="primary" onClick={() => run()} disabled={busy || chosen.length < 2}>
                  {t.run}
                </button>
              </div>
              <div>
                <label>{t.items}</label>
                <div className="chips">
                  {sector.compare_items.map((c) => (
                    <button
                      key={c}
                      className={`pick ${items.includes(c) ? "on" : ""}`}
                      onClick={() => toggle(items, setItems, c)}
                      aria-pressed={items.includes(c)}
                    >
                      {nameOf(item(c), lang, c)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label>{t.ratios}</label>
                <div className="chips">
                  {sector.ratios.map((r) => (
                    <button
                      key={r.code}
                      className={`pick ${ratios.includes(r.code) ? "on" : ""}`}
                      onClick={() => toggle(ratios, setRatios, r.code)}
                      aria-pressed={ratios.includes(r.code)}
                    >
                      {nameOf(r, lang)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {busy && !res ? (
        <Loading />
      ) : !res ? null : !d ? (
        <section className="panel">
          <div className="panel-body">
            <WhyNot res={res} />
          </div>
        </section>
      ) : (
        <section className="panel">
          <ScrollCue label={lang === "ar" ? "شركات أخرى" : "More companies"}>
            <table className="stmt">
              <thead>
                <tr>
                  <th>{t.item}</th>
                  {shown.map((s: string) => (
                    <th key={s} className="fig">
                      {companyName(s)}
                    </th>
                  ))}
                  {total && <th className="fig">{lang === "ar" ? "المجموع" : "Total"}</th>}
                  <th>{t.coverage}</th>
                </tr>
              </thead>
              <tbody>
                {(d.items ?? []).map((row: any) => {
                  const by = new Map((row.values ?? []).map((v: any) => [v.symbol, v]));
                  const per = !!item(row.item)?.per_share;
                  return (
                    <tr key={row.item}>
                      <td>{nameOf(item(row.item), lang, row.item)}</td>
                      {shown.map((s: string) => {
                        const v: any = by.get(s);
                        const mk = marks(v);
                        return (
                          <td key={s} className="fig">
                            {v ? per ? <Price v={v.value} /> : <Fig v={v.value} /> : <span className="muted">—</span>}
                            {mk.length > 0 && (
                              <div className="small muted ltr-block" lang="en" style={{ textAlign: "end" }}>
                                {mk.join(" · ")}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      {total && <td className="fig">{row.total ? <Fig v={row.total.value_sar} /> : "—"}</td>}
                      <td className="small muted">
                        <Coverage text={row.total?.scope ?? row.coverage} lang={lang} />
                      </td>
                    </tr>
                  );
                })}
                {(d.ratios ?? []).map((r: any) => {
                  const by = new Map((r.values ?? []).map((v: any) => [v.symbol, v]));
                  const reg = ratio(r.ratio);
                  return (
                    <tr key={r.ratio}>
                      <td>
                        {nameOf(reg, lang, r.ratio)}
                        <div className="small muted" lang={lang === "ar" && reg?.formula_ar ? "ar" : "en"}>
                          {lang === "ar" && reg?.formula_ar ? reg.formula_ar : reg?.formula_en ?? r.formula}
                        </div>
                      </td>
                      {shown.map((s: string) => {
                        const v: any = by.get(s);
                        return (
                          <td key={s} className="fig">
                            {v ? <bdi className="num">{percent(v.value_percent)}</bdi> : <span className="muted">—</span>}
                          </td>
                        );
                      })}
                      {total && <td />}
                      <td className="small muted">{t.computedBySpear}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollCue>
          <div className="panel-body">
            <p className="small muted" style={{ marginTop: 0 }}>
              {lang === "ar"
                ? "القيم كما وردت بوحدة كل قائمة (بآلاف ر.س غالبًا)؛ المجموع بالريال السعودي."
                : "Values as printed in each statement's unit (mostly SAR '000); the total in SAR."}
            </p>
            <Notes res={res} />
          </div>
        </section>
      )}
    </>
  );
}

// "4 of 4 companies" / "8 of 10 companies (missing: ...)", in the reader's language
function Coverage({ text, lang }: { text: string | null | undefined; lang: string }) {
  if (!text) return null;
  // the tool names its noun ("banks" when every member is a bank); the page says "companies"
  const m = /^(\d+) of (\d+) [a-z]+(.*)$/.exec(text);
  if (!m) return <span className="ltr-block" lang="en">{text}</span>;
  if (lang !== "ar") return <span className="ltr-block" lang="en">{`${m[1]} of ${m[2]} companies${m[3]}`}</span>;
  return (
    <span>
      <bdi className="num">{m[1]}</bdi> من <bdi className="num">{m[2]}</bdi> شركات
      {m[3] ? <span className="ltr-block" lang="en">{m[3]}</span> : null}
    </span>
  );
}
