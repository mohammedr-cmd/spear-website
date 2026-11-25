import { Fragment, useEffect, useRef, useState } from "react";
import { get, tool } from "../api";
import { day, percent, type Lang } from "../format";
import { useLang } from "../i18n";
import { meta, nameOf, type Sector } from "../meta";
import {
  D,
  Failed,
  Fig,
  NoteTags,
  Notes,
  Panel,
  Price,
  TagLegend,
  WhyNot,
  tagsOf,
} from "../components/Bits";
import { CompanyPicker } from "../components/CompanyPicker";
import { Paged } from "../components/Paged";

// the total column: wide enough for a sum in riyals ("2,262,267,339,000")
const TOTAL_W = 190;

// the periods with served figures in the sector, from the API (never a list on this page)
type Period = {
  period_end: string;
  companies: string[];
  months: { months: number; companies: string[] }[];
};

type Missing = { symbol: string; name: string }[];

// Companies of one sector side by side for one period, through the compare tool. The line items
// and ratios offered are the sector's own (the registry); ratios are computed by Spear with their
// formula. Every control refreshes the table at once (Mo, 25 Nov 2026): the table shows that it
// is updating, then the result, or "Not answered" with the reason; never nothing.
export function Compare() {
  const { t, lang } = useLang();
  const [sectors, setSectors] = useState<Sector[] | null>(null);
  const [metaErr, setMetaErr] = useState<unknown>(null);
  const [sectorKey, setSectorKey] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [pe, setPe] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [ratios, setRatios] = useState<string[]>([]);
  const [months, setMonths] = useState<number | "">("");
  const [total, setTotal] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [shown, setShown] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const phone = typeof window !== "undefined" && window.innerWidth < 860;

  const sector = sectors?.find((s) => s.key === sectorKey);

  function pickSector(s: Sector) {
    setSectorKey(s.key);
    setItems(s.compare_items.slice(0, 4));
    setRatios(s.ratios.slice(0, 2).map((r) => r.code));
    setChosen(s.members.slice(0, 4).map((m) => m.symbol));
    setMonths("");
    // the newest period with served figures, and four companies that have it (registry order)
    get<{ periods: Period[] }>(`/periods?sector=${encodeURIComponent(s.key)}`)
      .then((d) => {
        setPeriods(d.periods);
        const newest = d.periods[0];
        if (!newest) return;
        setPe(newest.period_end);
        const first = s.members
          .filter((m) => newest.companies.includes(m.symbol))
          .slice(0, 4)
          .map((m) => m.symbol);
        if (first.length >= 2) setChosen(first);
      })
      .catch((e) => setMetaErr(e));
  }

  useEffect(() => {
    meta()
      .then((m) => {
        setSectors(m.sectors);
        if (m.sectors[0]) pickSector(m.sectors[0]);
      })
      .catch((e) => {
        setMetaErr(e);
        setSectors([]);
      });
  }, []);

  const blocked =
    chosen.length < 2
      ? lang === "ar"
        ? "اختر شركتين على الأقل للمقارنة."
        : "Choose at least two companies to compare."
      : items.length + ratios.length === 0
        ? lang === "ar"
          ? "اختر بندًا أو نسبة واحدة على الأقل."
          : "Choose at least one item or ratio."
        : null;

  // every change refreshes the table (a short pause lets a run of clicks make one request)
  useEffect(() => {
    if (!sector || blocked || !pe) return;
    const n = ++seq.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      let r: any;
      try {
        r = await tool("compare", {
          symbols: chosen,
          items,
          period_end: pe,
          ratios,
          total,
          ...(months ? { months } : {}),
        });
      } catch {
        r = {
          status: "error",
          message: lang === "ar" ? "تعذّر الطلب." : "The request failed.",
        };
      }
      if (n !== seq.current) return; // a newer request is on its way
      setRes(r);
      setShown(chosen);
      setBusy(false);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorKey, chosen, items, ratios, pe, months, total, blocked]);

  const period = periods.find((p) => p.period_end === pe);
  const have = (list: string[]) =>
    chosen.filter((c) => list.includes(c)).length;
  const ofChosen = (list: string[]) =>
    lang === "ar"
      ? ` · ${have(list)} من ${chosen.length}`
      : ` · ${have(list)} of ${chosen.length}`;
  useEffect(() => {
    if (blocked) setBusy(false);
  }, [blocked]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const companyName = (s: string) =>
    nameOf(
      sector?.members.find((x) => x.symbol === s),
      lang,
      s,
    );
  const item = (c: string) => sector?.items.find((x) => x.code === c);
  const ratio = (c: string) => sector?.ratios.find((x) => x.code === c);
  const d = res?.data;
  const rowsAll: any[] = [...(d?.items ?? []), ...(d?.ratios ?? [])];
  const missingList = (m: Missing) =>
    m
      .map((x) => `${companyName(x.symbol)} (${x.symbol})`)
      .join(lang === "ar" ? "، " : ", ");
  const key = (m: Missing | undefined) =>
    (m ?? [])
      .map((x) => x.symbol)
      .sort()
      .join(",");
  // the missing set most rows share is said once under the table; a row that differs says its own
  const counts = new Map<string, number>();
  for (const r of rowsAll)
    if (key(r.missing))
      counts.set(key(r.missing), (counts.get(key(r.missing)) ?? 0) + 1);
  const common =
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const commonRow = rowsAll.find((r) => key(r.missing) === common && common);
  const tags = rowsAll.flatMap((r) =>
    (r.values ?? []).flatMap((v: any) => tagsOf(v)),
  );

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
      <Panel style={{ marginBottom: "var(--space-3)" }}>
        {() => (
          <>
            <div className="panel-body" style={{ display: "grid", gap: 16 }}>
              {metaErr ? (
                <Failed error={metaErr} />
              ) : !sectors || !sector ? (
                <p className="muted small">{t.loading}</p>
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
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                      alignItems: "end",
                    }}
                  >
                    <div>
                      <label htmlFor="pe">{t.period}</label>
                      <select
                        id="pe"
                        value={pe}
                        onChange={(e) => {
                          setPe(e.target.value);
                          setMonths("");
                        }}
                        style={{ width: "auto" }}
                      >
                        {periods.map((p) => (
                          <option key={p.period_end} value={p.period_end}>
                            {day(p.period_end, lang)}
                            {ofChosen(p.companies)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="months">
                        {lang === "ar"
                          ? "أشهر قائمة الدخل"
                          : "Income-statement months"}
                      </label>
                      <select
                        id="months"
                        value={months}
                        onChange={(e) =>
                          setMonths(
                            e.target.value ? Number(e.target.value) : "",
                          )
                        }
                        style={{ width: "auto" }}
                      >
                        <option value="">—</option>
                        {(period?.months ?? []).map((m) => (
                          <option key={m.months} value={m.months}>
                            {m.months}
                            {ofChosen(m.companies)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        margin: 0,
                        color: "var(--ink)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={total}
                        onChange={(e) => setTotal(e.target.checked)}
                        style={{ width: "auto" }}
                      />
                      {t.total}
                    </label>
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
                  <p
                    className={`run-status small ${blocked ? "blocked" : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    {blocked
                      ? blocked
                      : busy
                        ? lang === "ar"
                          ? "يُحدَّث الجدول…"
                          : "Updating the table…"
                        : lang === "ar"
                          ? "يتحدّث الجدول مع كل اختيار."
                          : "The table updates with each choice."}
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </Panel>

      {blocked ? null : !res ? (
        busy && (
          <p className="muted small">
            {lang === "ar" ? "يُحدَّث الجدول…" : "Updating the table…"}
          </p>
        )
      ) : !d ? (
        <Panel>
          {() => (
            <>
              <div className="panel-body">
                <WhyNot res={res} />
              </div>
            </>
          )}
        </Panel>
      ) : (
        <Panel
          className={busy || shown.join() !== chosen.join() ? "updating" : ""}
        >
          {() => (
            <>
              {busy && (
                <div className="updating-label small" role="status">
                  {lang === "ar" ? "يُحدَّث…" : "Updating…"}
                </div>
              )}
          <p className="table-caption small muted">
            {lang === "ar" ? "الفترة: " : "Period: "}
            <D>{day(pe, lang)}</D>
            {" · "}
            {months
              ? lang === "ar"
                ? `قائمة الدخل: ${months} أشهر`
                : `income statement: ${months} months`
              : lang === "ar"
                ? "قائمة الدخل: كما طُبعت للفترة"
                : "income statement: as printed for the period"}
          </p>
              <div className="panel-body tight">
                <TagLegend tags={tags} />
              </div>
              <Paged
                total={shown.length}
                noun={{ en: "Companies", ar: "الشركات" }}
                fixedWidth={(total ? TOTAL_W : 0) + (phone ? 0 : 130)}
                minItem={phone ? 0 : undefined}
              >
                {(start, count, colW) => {
                  const cols = shown.slice(start, start + count);
                  return (
                    <table className="stmt fit">
                      <colgroup>
                        {!phone && <col />}
                        {cols.map((s) => (
                          <col key={s} style={{ width: colW }} />
                        ))}
                        {total && <col style={{ width: TOTAL_W }} />}
                        {!phone && <col style={{ width: 130 }} />}
                      </colgroup>
                      <thead>
                        <tr>
                          {!phone && <th>{t.item}</th>}
                          {cols.map((s) => (
                            <th
                              key={s}
                              className="fig"
                              style={{ whiteSpace: "normal" }}
                            >
                              {companyName(s)}
                            </th>
                          ))}
                          {total && (
                            <th className="fig">
                              {lang === "ar" ? "المجموع" : "Total"}
                            </th>
                          )}
                          {!phone && <th>{t.coverage}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(d.items ?? []).map((row: any) => {
                          const by = new Map(
                            (row.values ?? []).map((v: any) => [v.symbol, v]),
                          );
                          const per = !!item(row.item)?.per_share;
                          return (
                            <Fragment key={row.item}>
                            {phone && (
                              <tr className="item-head">
                                <td colSpan={cols.length + (total ? 1 : 0)}>
                                  {nameOf(item(row.item), lang, row.item)}
                                  <span className="small muted">
                                    {" · "}
                                    <Coverage n={(row.values ?? []).length} of={shown.length} lang={lang} />
                                  </span>
                                  {key(row.missing) && key(row.missing) !== common && (
                                    <div className="small muted">
                                      <RowMissing m={row.missing} lang={lang} list={missingList} />
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                            <tr>
                              {!phone && <td>{nameOf(item(row.item), lang, row.item)}</td>}
                              {cols.map((s) => {
                                const v: any = by.get(s);
                                return (
                                  <td
                                    key={s}
                                    className="fig"
                                    data-fig
                                    data-paged
                                  >
                                    {v ? (
                                      per ? (
                                        <Price v={v.value} />
                                      ) : (
                                        <Fig v={v.value} />
                                      )
                                    ) : (
                                      <span className="muted">—</span>
                                    )}
                                    <NoteTags tags={tagsOf(v)} />
                                  </td>
                                );
                              })}
                              {total && (
                                <td className="fig" data-fig>
                                  {row.total ? (
                                    <Fig v={row.total.value_sar} />
                                  ) : (
                                    <span className="muted">—</span>
                                  )}
                                  {row.total && (
                                    <TotalScope total={row.total} lang={lang} />
                                  )}
                                </td>
                              )}
                              {!phone && (
                                <td className="small muted">
                                  <Coverage n={(row.values ?? []).length} of={shown.length} lang={lang} />
                                  {key(row.missing) && key(row.missing) !== common && (
                                    <RowMissing m={row.missing} lang={lang} list={missingList} />
                                  )}
                                </td>
                              )}
                            </tr>
                            </Fragment>
                          );
                        })}
                        {(d.ratios ?? []).map((r: any) => {
                          const by = new Map(
                            (r.values ?? []).map((v: any) => [v.symbol, v]),
                          );
                          const reg = ratio(r.ratio);
                          return (
                            <Fragment key={r.ratio}>
                            {phone && (
                              <tr className="item-head">
                                <td colSpan={cols.length + (total ? 1 : 0)}>
                                {nameOf(reg, lang, r.ratio)}
                                <div
                                  className="small muted"
                                  lang={
                                    lang === "ar" && reg?.formula_ar
                                      ? "ar"
                                      : "en"
                                  }
                                >
                                  {lang === "ar" && reg?.formula_ar
                                    ? reg.formula_ar
                                    : (reg?.formula_en ?? r.formula)}
                                </div>
                                  <span className="small muted">
                                    {" · "}
                                    <Coverage n={(r.values ?? []).length} of={shown.length} lang={lang} />
                                    {" · "}
                                    {t.computedBySpear}
                                  </span>
                                </td>
                              </tr>
                            )}
                            <tr>
                              {!phone && (
                              <td>
                                {nameOf(reg, lang, r.ratio)}
                                <div
                                  className="small muted"
                                  lang={
                                    lang === "ar" && reg?.formula_ar
                                      ? "ar"
                                      : "en"
                                  }
                                >
                                  {lang === "ar" && reg?.formula_ar
                                    ? reg.formula_ar
                                    : (reg?.formula_en ?? r.formula)}
                                </div>
                              </td>
                              )}
                              {cols.map((s) => {
                                const v: any = by.get(s);
                                return (
                                  <td
                                    key={s}
                                    className="fig"
                                    data-fig
                                    data-paged
                                  >
                                    {v ? (
                                      <bdi className="num">
                                        {percent(v.value_percent)}
                                      </bdi>
                                    ) : (
                                      <span className="muted">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              {total && <td />}
                              {!phone && (
                              <td className="small muted">
                                <Coverage
                                  n={(r.values ?? []).length}
                                  of={shown.length}
                                  lang={lang}
                                />
                                {key(r.missing) &&
                                  key(r.missing) !== common && (
                                    <RowMissing
                                      m={r.missing}
                                      lang={lang}
                                      list={missingList}
                                    />
                                  )}
                                <div>{t.computedBySpear}</div>
                              </td>
                              )}
                            </tr>
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                }}
              </Paged>
              <div className="panel-body">
                {commonRow && (
                  <p className="missing-once" style={{ marginTop: 0 }}>
                    {lang === "ar"
                      ? "لا توجد أرقام معتمدة لـ: "
                      : "No signed-off figure for: "}
                    {missingList(commonRow.missing)}
                    {counts.size > 1 &&
                      (lang === "ar"
                        ? " (في معظم الصفوف؛ الصفوف المختلفة تذكر شركاتها)."
                        : " (most rows; rows that differ name their own).")}
                  </p>
                )}
                <p className="small muted" style={{ marginTop: 0 }}>
                  {lang === "ar"
                    ? "القيم كما وردت بوحدة كل قائمة (بآلاف ر.س غالبًا)؛ المجموع بالريال السعودي."
                    : "Values as printed in each statement's unit (mostly SAR '000); the total in SAR."}
                </p>
                <Notes res={res} />
              </div>
            </>
          )}
        </Panel>
      )}
    </>
  );
}

function Coverage({ n, of, lang }: { n: number; of: number; lang: Lang }) {
  return lang === "ar" ? (
    <span>
      <bdi className="num">{n}</bdi> من <bdi className="num">{of}</bdi> شركات
    </span>
  ) : (
    <span>
      <bdi className="num">{n}</bdi> of <bdi className="num">{of}</bdi>{" "}
      companies
    </span>
  );
}

function RowMissing({
  m,
  lang,
  list,
}: {
  m: Missing;
  lang: Lang;
  list: (m: Missing) => string;
}) {
  return (
    <div>
      {lang === "ar" ? "لا رقم معتمد لـ: " : "No figure for: "}
      {list(m)}
    </div>
  );
}

// a total states its coverage: how many companies it adds up (the missing ones are named once
// under the table, or in the row's coverage cell when its set differs)
function TotalScope({ total, lang }: { total: any; lang: Lang }) {
  return (
    <div className="small muted total-scope">
      <Coverage n={total.included} of={total.of} lang={lang} />
    </div>
  );
}
