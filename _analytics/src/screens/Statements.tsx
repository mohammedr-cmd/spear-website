import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { tool } from "../api";
import { period, unit } from "../format";
import { useLang } from "../i18n";
import { meta, nameOf, sectorOf, type Sector } from "../meta";
import { D, Fig, Loading, Notes, Price, ScrollCue, WhyNot } from "../components/Bits";
import { CompanyPicker } from "../components/CompanyPicker";
import { SourcePanel, type FactRow } from "../components/SourcePanel";
import type { Me } from "../App";

const MAX_COLS = 8;

// One company's statement: pick a sector, then a company by name or symbol. The rows are the
// sector's own line items from the registry, never a list on this page.
export function Statements({ me }: { me: Me }) {
  const { t, lang } = useLang();
  const { symbol: param } = useParams();
  const nav = useNavigate();
  const [sectors, setSectors] = useState<Sector[] | null>(null);
  const [sectorKey, setSectorKey] = useState<string | null>(null);
  const [stmt, setStmt] = useState<"BS" | "IS">("BS");
  const [res, setRes] = useState<any>(null);
  const [sel, setSel] = useState<FactRow | null>(null);

  useEffect(() => {
    meta()
      .then((m) => setSectors(m.sectors))
      .catch(() => setSectors([]));
  }, []);
  const symbol = param ?? sectors?.[0]?.members[0]?.symbol ?? null;
  const sector =
    sectors?.find((s) => s.key === sectorKey) ?? (symbol && sectors ? sectorOf(sectors, symbol) : undefined) ?? sectors?.[0];

  useEffect(() => {
    if (!symbol) return;
    setRes(null);
    setSel(null);
    tool("get_financials", { symbol, statement: stmt }).then(setRes).catch(() => setRes({ status: "error" }));
  }, [symbol, stmt]);

  const rows: FactRow[] = Array.isArray(res?.data) ? res.data : [];
  const cols = useMemo(() => {
    const seen = new Map<string, { pe: string; months: number | null }>();
    for (const r of rows) seen.set(`${r.period_end}|${r.period_months ?? ""}`, { pe: r.period_end, months: r.period_months });
    return [...seen.entries()]
      .sort((a, b) => (a[1].pe < b[1].pe ? 1 : a[1].pe > b[1].pe ? -1 : (b[1].months ?? 0) - (a[1].months ?? 0)))
      .slice(0, MAX_COLS);
  }, [rows]);
  const cell = useMemo(() => {
    const c = new Map<string, FactRow>();
    for (const r of rows) c.set(`${r.line_item_code}|${r.period_end}|${r.period_months ?? ""}`, r);
    return c;
  }, [rows]);
  const sectorItems = sector?.items ?? [];
  const items = sectorItems.filter((i) => i.statement === stmt && rows.some((r) => r.line_item_code === i.code));
  const name = (code: string) => nameOf(sectorItems.find((x) => x.code === code), lang, code);
  const company = sector?.members.find((b) => b.symbol === symbol);
  const scale = rows.find((r) => r.scale)?.scale ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            {t.statements}
            {sector ? ` · ${nameOf(sector, lang)}` : ""}
          </span>
          <h1 className="title">{company ? nameOf(company, lang) : symbol}</h1>
        </div>
        <div className="seg" role="group" aria-label={t.statement}>
          <button className={stmt === "BS" ? "on" : ""} onClick={() => setStmt("BS")}>
            {t.bs}
          </button>
          <button className={stmt === "IS" ? "on" : ""} onClick={() => setStmt("IS")}>
            {t.is}
          </button>
        </div>
      </div>
      {sectors && sector && (
        <section className="panel" style={{ marginBottom: "var(--space-3)" }}>
          <div className="panel-body">
            <CompanyPicker
              sectors={sectors}
              sector={sector.key}
              onSector={(k) => {
                setSectorKey(k);
                const first = sectors.find((s) => s.key === k)?.members[0];
                if (first) nav(`/statements/${first.symbol}`);
              }}
              selected={symbol ? [symbol] : []}
              onToggle={(s) => nav(`/statements/${s}`)}
              multi={false}
            />
          </div>
        </section>
      )}
      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <span className="small muted">
              {unit(scale, false, lang)} · {t.signedOffOnly}
            </span>
          </div>
          {!res ? (
            <div className="panel-body">
              <Loading />
            </div>
          ) : rows.length === 0 ? (
            <div className="panel-body">
              <WhyNot res={res} />
            </div>
          ) : (
            <ScrollCue label={t.moreRight}>
              <table className="stmt">
                <thead>
                  <tr>
                    <th>{t.item}</th>
                    {cols.map(([k, c]) => (
                      <th key={k} className="fig">
                        <D>{period(c.pe, c.months, lang)}</D>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.code} className={i.is_total ? "total" : ""}>
                      <td>
                        {name(i.code)}
                        {i.per_share && <span className="mark">{unit(null, true, lang)}</span>}
                      </td>
                      {cols.map(([k, c]) => {
                        const r = cell.get(`${i.code}|${c.pe}|${c.months ?? ""}`);
                        if (!r)
                          return (
                            <td key={k} className="fig muted">
                              —
                            </td>
                          );
                        return (
                          <td key={k} className="cell-btn">
                            <button
                              className={sel?.fact_id === r.fact_id ? "sel" : ""}
                              onClick={() => setSel(r)}
                              aria-label={`${name(i.code)}, ${period(c.pe, c.months, lang)}`}
                            >
                              {i.per_share ? <Price v={r.value} /> : <Fig v={r.value} />}
                              {(r.restated || r.includes || r.reports_differ) && <span className="mark">*</span>}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollCue>
          )}
          {res && rows.length > 0 && (
            <div className="panel-body">
              <Notes res={res} />
            </div>
          )}
        </section>
        <SourcePanel
          row={sel}
          itemName={sel ? name(sel.line_item_code) : ""}
          perShare={!!sectorItems.find((x) => x.code === sel?.line_item_code)?.per_share}
          isOwner={me.role === "owner"}
          onClose={() => setSel(null)}
        />
      </div>
    </>
  );
}
