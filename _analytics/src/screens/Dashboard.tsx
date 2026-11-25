import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { get } from "../api";
import { day, grouped } from "../format";
import { useLang } from "../i18n";
import { D, Loading, Price, SahmkLine } from "../components/Bits";
import type { Me } from "../App";

type Row = {
  symbol: string;
  name_en: string;
  name_ar: string | null;
  figures_signed_off: number;
  reports_signed_off: number;
  reports_held: number;
  latest_signed_off_period: string | null;
  status: string;
};
type SectorRow = {
  key: string;
  name_en: string;
  name_ar: string;
  companies: number;
  companies_covered: number;
  figures: number;
  status: string;
};
type Dash = {
  headline: { key: string; label: string; value: number | string | null; missing?: string[] }[];
  sectors: SectorRow[];
  other: { companies: number; status: string; why: string };
  selected: string;
  companies: Row[];
  tasi: any | null;
};

const HEAD_AR: Record<string, string> = {
  figures: "الأرقام المعتمدة",
  reports: "التقارير المعتمدة",
  companies: "الشركات ذات القوائم المعتمدة",
  latest: "آخر فترة معتمدة",
};

function statusAr(b: Row): string {
  if (b.reports_signed_off) return `اعتُمد ${b.reports_signed_off} من ${b.reports_held} تقارير`;
  if (b.reports_held) return `لم يُعتمد بعد (${b.reports_held} تقارير محفوظة)`;
  return "لا تقارير محفوظة";
}

export function Spark({ closes }: { closes: number[] }) {
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const w = 300;
  const h = 72;
  const pts = closes
    .map((c, i) => `${(i / (closes.length - 1)) * w},${h - 6 - ((c - min) / (max - min || 1)) * (h - 12)}`)
    .join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="var(--line)" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Dashboard({ me }: { me: Me }) {
  const { t, lang } = useLang();
  const nav = useNavigate();
  const [sector, setSector] = useState("banks");
  const [d, setD] = useState<Dash | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    get<Dash>(`/dashboard?sector=${encodeURIComponent(sector)}`).then(setD).catch(() => {});
  }, [sector]);
  function ask(e: FormEvent) {
    e.preventDefault();
    if (q.trim()) nav(`/chat?q=${encodeURIComponent(q.trim())}`);
  }
  const rows = d?.tasi?.data;
  const last = Array.isArray(rows) ? rows[rows.length - 1] : null;
  const sel = d?.sectors.find((s) => s.key === d.selected);
  const nm = (x: { name_en: string; name_ar: string | null }) => (lang === "ar" ? x.name_ar ?? x.name_en : x.name_en);
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">{t.dashboard}</span>
          <h1 className="title">{t.signedOffOnly}</h1>
        </div>
      </div>
      <form className="ask" onSubmit={ask}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.askPlaceholder} aria-label={t.ask} dir="auto" />
        <button className="primary" type="submit">{t.ask}</button>
      </form>
      {!d ? (
        <Loading />
      ) : (
        <>
          <div className="counts">
            {d.headline.map((h) => (
              <div key={h.key}>
                <span className="small muted">{lang === "ar" ? HEAD_AR[h.key] : h.label}</span>
                <span className="figure-xl">
                  {h.key === "latest" ? (
                    <D>{h.value ? day(String(h.value), lang) : "—"}</D>
                  ) : h.key === "companies" ? (
                    lang === "ar" ? (
                      <bdi className="num">{String(h.value).replace(/ of (\d+) companies/, " / $1")}</bdi>
                    ) : (
                      <bdi className="num">{String(h.value).replace(/ companies$/, "")}</bdi>
                    )
                  ) : (
                    <bdi className="num">{grouped(String(h.value))}</bdi>
                  )}
                </span>
                {h.missing && h.missing.length > 0 && (
                  <span className="small muted" style={{ display: "block" }}>
                    {lang === "ar" ? "غير مشمول: " : "Missing: "}
                    {h.missing
                      .map((n) => (lang === "ar" ? d.companies.find((b) => b.name_en === n)?.name_ar ?? n : n))
                      .join(lang === "ar" ? "، " : ", ")}
                  </span>
                )}
              </div>
            ))}
          </div>

          <section className="panel" style={{ marginBottom: "var(--space-3)" }}>
            <div className="panel-head">
              <h2 className="heading">{t.sectors}</h2>
            </div>
            <ul className="sector-list">
              {d.sectors.map((s) => (
                <li key={s.key} className={s.key === d.selected ? "on" : ""}>
                  <button onClick={() => setSector(s.key)} aria-pressed={s.key === d.selected}>
                    <span className="sector-name">{nm(s)}</span>
                    <span className="small">
                      {lang === "ar" ? (
                        <>
                          <bdi className="num">{s.companies_covered}</bdi> من <bdi className="num">{s.companies}</bdi> شركات، <bdi className="num">{grouped(String(s.figures))}</bdi> {t.figures}
                        </>
                      ) : (
                        <>
                          <bdi className="num">{s.companies_covered}</bdi> of <bdi className="num">{s.companies}</bdi> companies, <bdi className="num">{grouped(String(s.figures))}</bdi> figures
                        </>
                      )}
                    </span>
                  </button>
                </li>
              ))}
              <li className="uncovered">
                <div>
                  <span className="sector-name">{t.otherSectors}</span>
                  <span className="small">
                    <bdi className="num">{grouped(String(d.other.companies))}</bdi> {lang === "ar" ? "شركة" : "companies"} · {t.notYetCovered}
                  </span>
                  <span className="small muted" style={{ display: "block" }}>{t.otherWhy}</span>
                </div>
              </li>
            </ul>
          </section>

          <div className="grid-2">
            <section className="panel">
              <div className="panel-head">
                <h2 className="heading">
                  {t.companiesIn}
                  {sel ? <span className="muted"> · {nm(sel)}</span> : null}
                </h2>
              </div>
              <div className="scroll">
                <table className="banks">
                  <thead>
                    <tr>
                      <th>{t.bank}</th>
                      <th className="fig">{t.figuresSignedOff}</th>
                      <th className="fig">{t.latestPeriod}</th>
                      <th>{t.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.companies.map((b) => (
                      <tr key={b.symbol}>
                        <td>
                          <Link to={`/statements/${b.symbol}`}>{nm(b)}</Link>{" "}
                          <span className="small muted num">{b.symbol}</span>
                        </td>
                        <td className="fig">
                          <bdi className="num">{grouped(String(b.figures_signed_off))}</bdi>
                        </td>
                        <td className="fig">
                          <D>{b.latest_signed_off_period ? day(b.latest_signed_off_period, lang) : "—"}</D>
                        </td>
                        <td className="small">{lang === "ar" ? statusAr(b) : b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2 className="heading">{t.tasi}</h2>
              </div>
              <div className="panel-body">
                {d.tasi && last ? (
                  <>
                    <span className="small muted">{t.lastClose}</span>
                    <div className="figure-xl" style={{ fontSize: 40, lineHeight: "48px" }}>
                      <Price v={last.close} />
                    </div>
                    <div className="small muted">
                      <D>{day(last.date, lang)}</D>
                    </div>
                    <Spark closes={rows.map((r: any) => Number(r.close))} />
                    <SahmkLine res={d.tasi} />
                  </>
                ) : (
                  <p className="small muted">{me.can_see_sahmk ? t.notInData : t.sahmkHidden}</p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
