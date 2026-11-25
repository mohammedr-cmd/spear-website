import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { post, resetCsrf } from "../api";
import { useLang } from "../i18n";
import type { Me } from "../App";

export function Lockup({ reversed = false }: { reversed?: boolean }) {
  const { lang, t } = useLang();
  const file = lang === "ar" ? "spear-ar-lockup" : "spear-lockup-horizontal";
  return (
    <a className="lockup" href="/">
      <img src={`/brand/${file}${reversed ? "-reversed" : ""}.svg`} alt={lang === "ar" ? "رمح" : "Spear"} />
      <span className="eyebrow">{t.appName}</span>
    </a>
  );
}

export function LangThemeToggles() {
  const { lang, t, setLang } = useLang();
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem("spear.theme") ?? "paper";
    } catch {
      return "paper";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("spear.theme", theme);
    } catch {
      /* storage may be unavailable */
    }
  }, [theme]);
  return (
    <>
      <button className="quiet" onClick={() => setTheme(theme === "ink" ? "paper" : "ink")}>
        {theme === "ink" ? t.paper : t.ink}
      </button>
      <button className="quiet" lang={lang === "ar" ? "en" : "ar"} onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
        {lang === "ar" ? "English" : "عربي"}
      </button>
    </>
  );
}

export function Shell({ me, onSignedOut, children }: { me: Me; onSignedOut: () => void; children: ReactNode }) {
  const { t } = useLang();
  const full = useLocation().pathname === "/chat";
  async function signOut() {
    try {
      await post("/auth/logout");
    } finally {
      resetCsrf();
      onSignedOut();
    }
  }
  return (
    <>
      <header className="header">
        <div className="wrap">
          <Lockup />
          <nav className="nav">
            <NavLink to="/" end>{t.dashboard}</NavLink>
            <NavLink to="/statements">{t.statements}</NavLink>
            <NavLink to="/compare">{t.compare}</NavLink>
            <NavLink to="/chat">{t.chat}</NavLink>
            {me.can_see_sahmk && <NavLink to="/market">{t.market}</NavLink>}
          </nav>
          <div className="tools">
            <LangThemeToggles />
            <button className="quiet" onClick={signOut}>{t.signOut}</button>
          </div>
        </div>
      </header>
      <main className={full ? "full" : ""}>
        <div className="wrap">{children}</div>
      </main>
    </>
  );
}
