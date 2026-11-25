import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ApiError, get, health, onOffline, onSignedOut } from "./api";
import type { Lang } from "./format";
import { LangContext, STRINGS } from "./i18n";
import { Shell } from "./components/Shell";
import { Boundary } from "./components/Boundary";
import { PartFailed } from "./components/Bits";
import { OfflinePage } from "./components/Offline";
import { Login } from "./screens/Login";
import { Dashboard } from "./screens/Dashboard";
import { Statements } from "./screens/Statements";
import { Chat } from "./screens/Chat";
import { Compare } from "./screens/Compare";
import { Market } from "./screens/Market";
import { Invite, Reset } from "./screens/Public";

export type Me = {
  email: string;
  role: "owner" | "member";
  can_see_sahmk: boolean;
  display_name: string | null;
};

function initialLang(): Lang {
  try {
    const s = localStorage.getItem("spear.lang");
    if (s === "ar" || s === "en") return s;
  } catch {
    /* storage may be unavailable */
  }
  return navigator.language?.startsWith("ar") ? "ar" : "en";
}

// each page in its own boundary: a failure outside a panel still never blanks the app
function Page({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <Boundary name={`page ${name}`} fallback={(retry) => <PartFailed retry={retry} />}>
      {children}
    </Boundary>
  );
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined: checking
  const [offline, setOffline] = useState(false);
  const loc = useLocation();

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("spear.lang", l);
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  useEffect(() => onOffline(setOffline), []);
  // a session that ended mid-use goes back to sign-in, never a broken card
  useEffect(() => onSignedOut(() => setMe(null)), []);

  const refresh = useCallback(async () => {
    if (!(await health())) {
      setOffline(true);
      return;
    }
    try {
      setMe(await get<Me>("/auth/me"));
    } catch (e) {
      if (e instanceof ApiError) setMe(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const ctx = useMemo(() => ({ lang, t: STRINGS[lang], setLang }), [lang, setLang]);

  if (offline) {
    return (
      <LangContext.Provider value={ctx}>
        <OfflinePage onRetry={() => { setOffline(false); refresh(); }} />
      </LangContext.Provider>
    );
  }
  const publicPaths = ["/invite", "/reset"];
  return (
    <LangContext.Provider value={ctx}>
      {publicPaths.includes(loc.pathname) ? (
        <Routes>
          <Route path="/invite" element={<Invite />} />
          <Route path="/reset" element={<Reset />} />
        </Routes>
      ) : me === undefined ? null : me === null ? (
        <Login onSignedIn={refresh} />
      ) : (
        <Shell me={me} onSignedOut={() => setMe(null)} onName={(display_name) => setMe({ ...me, display_name })}>
          <Routes>
            <Route path="/" element={<Page name="/"><Dashboard me={me} /></Page>} />
            <Route path="/statements" element={<Page name="/statements"><Statements me={me} /></Page>} />
            <Route path="/statements/:symbol" element={<Page name="/statements/:symbol"><Statements me={me} /></Page>} />
            <Route path="/compare" element={<Page name="/compare"><Compare /></Page>} />
            <Route path="/chat" element={<Page name="/chat"><Chat me={me} /></Page>} />
            <Route path="/market" element={me.can_see_sahmk ? <Page name="/market"><Market /></Page> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Shell>
      )}
    </LangContext.Provider>
  );
}
