import type React from "react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ApiError, post, resetCsrf } from "../api";
import { Boundary } from "./Boundary";
import { useLang } from "../i18n";
import type { Me } from "../App";

// The lockup in the theme's colour: the ink logo on Paper, the reversed (paper-colour) logo on
// Ink (Mo, 25 Nov 2026). Both are in the page; the theme's CSS shows one.
export function Lockup() {
  const { lang, t } = useLang();
  const file = lang === "ar" ? "spear-ar-lockup" : "spear-lockup-horizontal";
  const alt = lang === "ar" ? "رمح" : "Spear";
  return (
    <a className="lockup" href="/">
      <img className="logo-on-paper" src={`/brand/${file}.svg`} alt={alt} />
      <img className="logo-on-ink" src={`/brand/${file}-reversed.svg`} alt={alt} />
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
      <button className="quiet" data-allow-en lang={lang === "ar" ? "en" : "ar"} onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
        {lang === "ar" ? "English" : "عربي"}
      </button>
    </>
  );
}

export function Shell({
  me,
  onSignedOut,
  onName,
  children,
}: {
  me: Me;
  onSignedOut: () => void;
  onName: (name: string | null) => void;
  children: ReactNode;
}) {
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
            <Boundary name="profile menu" fallback={() => null}>
              <ProfileMenu me={me} onName={onName} />
            </Boundary>
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

// A small profile menu: the person's display name, which they can change (Arabic or English,
// shown exactly as typed). It is theirs: shown to them, and to the owner in the member list.
function ProfileMenu({ me, onName }: { me: Me; onName: (name: string | null) => void }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(me.display_name ?? "");
  const [msg, setMsg] = useState("");
  const ar = lang === "ar";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      const r = await post<{ display_name: string | null }>("/auth/profile", { display_name: name });
      onName(r.display_name);
      setName(r.display_name ?? "");
      setMsg(ar ? "حُفظ الاسم." : "Name saved.");
    } catch (x) {
      setMsg(x instanceof ApiError && x.status === 429 ? (ar ? "بلغت حد الطلبات؛ أعد المحاولة بعد دقيقة." : "Request limit reached; try again in a minute.") : ar ? "تعذّر الحفظ." : "Couldn't save the name.");
    }
  }
  return (
    <div className="profile">
      <button className="quiet" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
        {ar ? "حسابي" : "Account"}
      </button>
      {open && (
        <form className="profile-menu" onSubmit={save} role="dialog" aria-label={ar ? "الملف الشخصي" : "Profile"}>
          <label htmlFor="display-name">{ar ? "الاسم المعروض" : "Display name"}</label>
          <input id="display-name" dir="auto" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <p className="small muted" style={{ margin: "6px 0 10px" }}>
            {ar ? "يظهر لك، وللمالك في قائمة الأعضاء. لا يُرسل إلى نموذج المحادثة." : "Shown to you, and to the owner in the member list. Never sent to the chat model."}
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="primary" type="submit">{ar ? "حفظ" : "Save"}</button>
            {msg && <span className="small muted" role="status">{msg}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
