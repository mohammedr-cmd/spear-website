import { D } from "./Bits";
import { day } from "../format";
import { useLang } from "../i18n";
import { LangThemeToggles, Lockup } from "./Shell";

// Shown whenever the API can't be reached: the PC is off, asleep or not connected. Never a
// half-loaded screen.
export function OfflinePage({ onRetry }: { onRetry: () => void }) {
  const { t, lang } = useLang();
  let last: string | null = null;
  try {
    last = localStorage.getItem("spear.lastReached");
  } catch {
    /* storage may be unavailable */
  }
  return (
    <div className="offline">
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
          <Lockup />
          <div className="tools">
            <LangThemeToggles />
          </div>
        </div>
        <h1 className="display">{t.offlineTitle}</h1>
        <p className="muted" style={{ maxWidth: 480 }}>{t.offlineBody}</p>
        {last && (
          <p className="small muted">
            {t.lastReached}: <D>{day(last.slice(0, 10), lang)}</D>
          </p>
        )}
        <button className="primary" onClick={onRetry}>{t.tryAgain}</button>
      </div>
    </div>
  );
}
