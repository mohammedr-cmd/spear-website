import { useState, type FormEvent } from "react";
import { ApiError, post } from "../api";
import { useLang } from "../i18n";
import { PublicFrame } from "./Login";

// The invitation link carries its token after "#", so it never reaches a server log.
export function Invite() {
  const { t } = useLang();
  const token = window.location.hash.slice(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await post("/auth/invite/accept", { token, email, password });
      setMsg(t.accountReady);
      history.replaceState(null, "", "/invite");
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : t.offlineTitle);
    }
  }
  return (
    <PublicFrame>
      <form onSubmit={submit}>
        <h2 className="title" style={{ marginBottom: 12 }}>{t.createAccount}</h2>
        {msg ? (
          <>
            <p className="notice">{msg}</p>
            <a className="btn primary" href="/">{t.signIn}</a>
          </>
        ) : !token ? (
          <p className="muted">{t.inviteBody}</p>
        ) : (
          <>
            {err && <p className="err ltr-block" lang="en" role="alert">{err}</p>}
            <div className="field">
              <label htmlFor="iemail">{t.email}</label>
              <input id="iemail" type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="ipw">{t.password}</label>
              <input id="ipw" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} />
              <p className="small muted" style={{ margin: "6px 0 0" }}>{t.passwordRule}</p>
            </div>
            <button className="primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>{t.createAccount}</button>
          </>
        )}
      </form>
    </PublicFrame>
  );
}

export function Reset() {
  const { t } = useLang();
  const params = new URLSearchParams(window.location.hash.slice(1));
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await post("/auth/reset/confirm", { uid: params.get("uid"), token: params.get("token"), password });
      setMsg(t.passwordSet);
      history.replaceState(null, "", "/reset");
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : t.offlineTitle);
    }
  }
  return (
    <PublicFrame>
      <form onSubmit={submit}>
        <h2 className="title" style={{ marginBottom: 12 }}>{t.newPassword}</h2>
        {msg ? (
          <>
            <p className="notice">{msg}</p>
            <a className="btn primary" href="/">{t.signIn}</a>
          </>
        ) : (
          <>
            {err && <p className="err ltr-block" lang="en" role="alert">{err}</p>}
            <div className="field">
              <label htmlFor="npw">{t.newPassword}</label>
              <input id="npw" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} />
              <p className="small muted" style={{ margin: "6px 0 0" }}>{t.passwordRule}</p>
            </div>
            <button className="primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>{t.setPassword}</button>
          </>
        )}
      </form>
    </PublicFrame>
  );
}
