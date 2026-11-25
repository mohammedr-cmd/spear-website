import { useState } from "react";
import { useLang } from "../i18n";
import { nameOf, search, type Company, type Sector } from "../meta";

// Pick a sector, then companies, searching by name or symbol in English or Arabic. No fixed list
// of names as buttons: the sector's members come from the registry.
export function CompanyPicker({
  sectors,
  sector,
  onSector,
  selected,
  onToggle,
  multi,
}: {
  sectors: Sector[];
  sector: string;
  onSector: (k: string) => void;
  selected: string[];
  onToggle: (symbol: string) => void;
  multi: boolean;
}) {
  const { t, lang } = useLang();
  const [q, setQ] = useState("");
  const sec = sectors.find((s) => s.key === sector);
  const members: Company[] = sec?.members ?? [];
  const found = search(members, q);
  const chosen = members.filter((m) => selected.includes(m.symbol));
  return (
    <div className="picker">
      <div className="picker-row">
        <div>
          <label htmlFor="sector">{t.sector}</label>
          <select id="sector" value={sector} onChange={(e) => onSector(e.target.value)}>
            {sectors.map((s) => (
              <option key={s.key} value={s.key}>
                {nameOf(s, lang)}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label htmlFor="company-search">{multi ? t.companies : t.company}</label>
          <input
            id="company-search"
            type="search"
            dir="auto"
            placeholder={t.searchCompany}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      {!multi && chosen[0] && !q && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          {t.showing}: <strong style={{ color: "var(--ink)" }}>{nameOf(chosen[0], lang)}</strong>{" "}
          <span className="num">{chosen[0].symbol}</span>
        </p>
      )}
      {multi && chosen.length > 0 && (
        <div className="chips" aria-label={t.companies} style={{ marginTop: 10 }}>
          {chosen.map((m) => (
            <button key={m.symbol} className="pick on" onClick={() => onToggle(m.symbol)} aria-label={`${nameOf(m, lang)} ×`}>
              {nameOf(m, lang)} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      {q && (
        <ul className="results" role="listbox" aria-label={t.companies}>
          {found.map((m) => (
            <li key={m.symbol}>
              <button
                role="option"
                aria-selected={selected.includes(m.symbol)}
                className={selected.includes(m.symbol) ? "on" : ""}
                onClick={() => {
                  onToggle(m.symbol);
                  setQ("");
                }}
              >
                <span>{nameOf(m, lang)}</span> <span className="small muted num">{m.symbol}</span>
              </button>
            </li>
          ))}
          {found.length === 0 && <li className="small muted">{t.noMatch}</li>}
        </ul>
      )}
    </div>
  );
}
