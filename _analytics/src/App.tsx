import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ApiError, get, health, onOffline } from "./api";
import type { Lang } from "./format";
import { LangContext, STRINGS } from "./i18n";
import { Shell } from "./components/Shell";
import { OfflinePage } from "./components/Offline";
import { Login } from "./screens/Login";
import { Dashboard } from "./screens/Dashboard";
import { Statements } from "./screens/Statements";
import { Chat } from "./screens/Chat";
import { Compare } from "./screens/Compare";
import { Market } from "./screens/Market";
import { Invite, Reset } from "./screens/Public";

export type Me = { email: string; role: "owner" | "member"; can_see_sahmk: boolean };

function initialLang(): Lang {
  try {
    const s = localStorage.getItem("spear.lang");
    if (s === "ar" || s === "en") return s;
  } catch {
    /* storage may be unavailable */
  }
  return navigator.language?.startsWith("ar") ? "ar" : "en";
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
        <Shell me={me} onSignedOut={() => setMe(null)}>
          <Routes>
            <Route path="/" element={<Dashboard me={me} />} />
            <Route path="/statements" element={<Statements me={me} />} />
            <Route path="/statements/:symbol" element={<Statements me={me} />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/chat" element={<Chat me={me} />} />
            <Route path="/market" element={me.can_see_sahmk ? <Market /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Shell>
      )}
    </LangContext.Provider>
  );
}
