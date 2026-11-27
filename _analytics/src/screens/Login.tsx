import { useState, type FormEvent } from "react";
import { ApiError, post, refreshCsrf } from "../api";
import { useLang } from "../i18n";
import { LangThemeToggles, Lockup } from "../components/Shell";

// The public page: no market data, ever (Mo, 25 Nov 2026).
export function PublicFrame({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  return (
    <div className="public">
      <section className="story">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <Lockup />
          <div className="tools">
            <LangThemeToggles />
          </div>
        </div>
        <h1 className="display" style={{ maxWidth: 560 }}>{t.headline}</h1>
        <ul>
          {[t.point1, t.point2, t.point3].map((p, i) => (
            <li key={i}>
              <b className="num">0{i + 1}</b>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="box">{children}</section>
    </div>
  );
}

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useLang();
  const [step, setStep] = useState<"password" | "code" | "forgot" | "sent">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(f: () => Promise<void>) {
    setErr("");
    setBusy(true);
    try {
      await f();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.offlineTitle);
    } finally {
      setBusy(false);
    }
  }

  function signIn(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      const r = await post("/auth/login", { email, password });
      if (r.second_step === "code_sent") {
        setStep("code");
        setPassword("");
      } else {
        await refreshCsrf(); // signing in replaced the token: fetch the new one first
        onSignedIn();
      }
    });
  }
  function verify(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await post("/auth/login/code", { code });
      await refreshCsrf(); // signing in replaced the token: fetch the new one first
      onSignedIn();
    });
  }
  function forgot(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await post("/auth/reset", { email });
      setStep("sent");
    });
  }

  return (
    <PublicFrame>
      {step === "password" && (
        <form onSubmit={signIn}>
          <h2 className="title" style={{ marginBottom: 24 }}>{t.signIn}</h2>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="field">
            <label htmlFor="email">{t.email}</label>
            <input id="email" type="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">{t.password}</label>
            <input id="password" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
            {t.signIn}
          </button>
          <div className="links">
            <button type="button" className="link" onClick={() => { setErr(""); setStep("forgot"); }}>
              {t.forgot}
            </button>
            <a href="/invite">{t.invitation}</a>
          </div>
        </form>
      )}
      {step === "code" && (
        <form onSubmit={verify}>
          <h2 className="title" style={{ marginBottom: 12 }}>{t.code}</h2>
          <p className="muted small">{t.codeSent}</p>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="field">
            <label htmlFor="code">{t.code}</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
          </div>
          <button className="primary" type="submit" disabled={busy || code.length !== 6} style={{ width: "100%", justifyContent: "center" }}>
            {t.verify}
          </button>
          <div className="links">
            <button type="button" className="link" onClick={() => setStep("password")}>{t.backToSignIn}</button>
          </div>
        </form>
      )}
      {(step === "forgot" || step === "sent") && (
        <form onSubmit={forgot}>
          <h2 className="title" style={{ marginBottom: 24 }}>{t.forgot}</h2>
          {err && <p className="err" role="alert">{err}</p>}
          {step === "sent" ? (
            <p className="notice">{t.resetSent}</p>
          ) : (
            <>
              <div className="field">
                <label htmlFor="remail">{t.email}</label>
                <input id="remail" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button className="primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
                {t.sendLink}
              </button>
            </>
          )}
          <div className="links">
            <button type="button" className="link" onClick={() => setStep("password")}>{t.backToSignIn}</button>
          </div>
        </form>
      )}
    </PublicFrame>
  );
}
