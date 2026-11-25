import { useEffect, useState } from "react";
import { imageUrl, tool } from "../api";
import { day } from "../format";
import { useLang } from "../i18n";
import { D, Fig, Loading, Notes, Price, WhyNot } from "./Bits";

export type FactRow = {
  fact_id: number;
  line_item_code: string;
  period_end: string;
  period_months: number | null;
  value: string;
  scale: number | null;
  document: string;
  page: number;
  method: string;
  location_status: string;
  includes: string | null;
  restated: string | null;
  reports_differ: boolean;
  differs_from_original: boolean;
  ocr_agreement: string | null;
  reviewed_by: string | null;
  signed_off: boolean;
};

const METHOD: Record<string, [string, string]> = {
  pdf_table: ["Read from the PDF's text layer", "مقروء من طبقة النص في ملف PDF"],
  xbrl: ["Read from the XBRL filing", "مقروء من ملف XBRL"],
  ocr: ["Read by OCR from a scanned page", "مقروء آليًا من صفحة ممسوحة"],
};

// The source panel: the figure as printed, how it was checked, the page with the figure boxed
// (members see this image only), and the owner's whole PDF.
export function SourcePanel({
  row,
  itemName,
  perShare = false,
  isOwner,
  onClose,
}: {
  row: FactRow | null;
  itemName: string;
  perShare?: boolean;
  isOwner: boolean;
  onClose: () => void;
}) {
  const { t, lang } = useLang();
  const [src, setSrc] = useState<any>(null);
  useEffect(() => {
    setSrc(null);
    if (row) tool("show_source", { fact_id: row.fact_id }).then(setSrc).catch(() => setSrc({ status: "error" }));
  }, [row]);
  if (!row) {
    return (
      <aside className="panel source-panel">
        <div className="panel-body muted small">{t.selectFigure}</div>
      </aside>
    );
  }
  const d = src?.data;
  const m = METHOD[row.method]?.[lang === "ar" ? 1 : 0] ?? row.method;
  return (
    <aside className="panel source-panel open" aria-label={t.sources}>
      <div className="panel-head">
        <span className="eyebrow">{t.sources}</span>
        <button className="quiet sheet-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="panel-body">
        <div className="heading">{itemName}</div>
        <div className="small muted">
          <D>{day(row.period_end, lang)}</D>
        </div>
        <div className="figure-xl" style={{ fontSize: 36, lineHeight: "44px", margin: "12px 0" }}>
          {perShare ? <Price v={row.value} /> : <Fig v={row.value} />}
        </div>
        <dl className="kv">
          <dt>{t.asPrinted}</dt>
          <dd className="ltr-block" lang="en">{d?.printed ?? "…"}</dd>
          <dt>{t.document}</dt>
          <dd className="ltr-block" lang="en">{row.document}</dd>
          <dt>{t.page}</dt>
          <dd><bdi className="num">{row.page}</bdi></dd>
          <dt>{t.checked}</dt>
          <dd>
            {m}
            {d ? (
              <span className="small muted">
                {" · "}
                {d.location_status === "confirmed"
                  ? lang === "ar" ? "موقع الرقم مؤكد على الصفحة" : "location on the page confirmed"
                  : lang === "ar" ? "موقع الرقم غير مؤكد" : "location not confirmed"}
              </span>
            ) : null}
          </dd>
        </dl>
        <div className="chips" style={{ marginBottom: 12 }}>
          {row.restated && <span className="chip">{t.restated}</span>}
          {row.includes && <span className="chip">{t.includes}: {row.includes}</span>}
          {row.reports_differ && <span className="chip">{t.reportsDiffer}</span>}
        </div>
        {row.restated && <p className="small ltr-block" lang="en">{row.restated}</p>}
        {!src ? (
          <Loading />
        ) : d?.page_image ? (
          <>
            {d.row_image && (
              <img className="row-crop" src={imageUrl(d.row_image)} alt={`${itemName}, ${t.asPrinted}`} />
            )}
            <a href={imageUrl(d.page_image)} target="_blank" rel="noopener">
              <img src={imageUrl(d.page_image)} alt={`${row.document}, ${t.page} ${row.page}`} loading="lazy" />
            </a>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <a className="btn" href={imageUrl(d.page_image)} target="_blank" rel="noopener">
                {t.openPage}
              </a>
              {isOwner && (
                <a className="btn" href={imageUrl(`/source/${row.fact_id}/pdf`) + `#page=${row.page}`} target="_blank" rel="noopener">
                  {t.openPdf}
                </a>
              )}
            </div>
          </>
        ) : (
          <WhyNot res={src} />
        )}
        <div style={{ marginTop: 12 }}>
          <Notes res={src} />
        </div>
      </div>
    </aside>
  );
}
