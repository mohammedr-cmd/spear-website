// The one way the app talks to the Spear API on Mo's PC. Every request carries the session cookie;
// every change carries the CSRF token. A network failure or Cloudflare's tunnel error (530/1033)
// means "Spear is offline", never a broken screen.
declare const __API_URL__: string;
export const API = __API_URL__;
import { noteResponse } from "./trace";

export class Offline extends Error {}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let csrf: string | null = null;
const offlineListeners = new Set<(off: boolean) => void>();
export function onOffline(f: (off: boolean) => void) {
  offlineListeners.add(f);
  return () => {
    offlineListeners.delete(f);
  };
}
function setOffline(off: boolean) {
  if (!off) {
    try {
      localStorage.setItem("spear.lastReached", new Date().toISOString());
    } catch {
      /* storage may be unavailable */
    }
  }
  offlineListeners.forEach((f) => f(off));
}

// Every request gives up after 5 seconds (docs/web-ui.md: no loading state spins forever). Then a
// quick health check decides: Spear unreachable (the offline screen), or Spear slow to answer
// (a named error on that card).
const WAIT_MS = 5000;

async function reachable(): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 2500);
  try {
    const r = await fetch(API + "/health", { credentials: "include", signal: ctl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function raw(path: string, init: RequestInit = {}, timeoutMs = WAIT_MS): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let r: Response;
  try {
    r = await fetch(API + path, { credentials: "include", ...init, signal: ctl.signal });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error)?.name === "AbortError" && (await reachable())) {
      throw new ApiError(408, "timeout", "Spear took too long to answer.");
    }
    setOffline(true);
    throw new Offline();
  }
  clearTimeout(timer);
  // the tunnel's errors, or a proxy's answer with no Spear body: Spear itself isn't answering
  const spearBody = (r.headers.get("content-type") ?? "").includes("application/json");
  if ([502, 503, 504, 530].includes(r.status) || (r.status >= 500 && !spearBody)) {
    setOffline(true);
    throw new Offline();
  }
  setOffline(false);
  if (r.status === 401 && !path.startsWith("/auth/")) signedOutListeners.forEach((f) => f());
  return r;
}

const signedOutListeners = new Set<() => void>();
export function onSignedOut(f: () => void) {
  signedOutListeners.add(f);
  return () => {
    signedOutListeners.delete(f);
  };
}

export async function health(): Promise<boolean> {
  const ok = await reachable();
  if (ok) setOffline(false);
  return ok;
}

async function token(): Promise<string> {
  if (csrf) return csrf;
  const r = await raw("/auth/csrf");
  csrf = (await r.json()).csrf;
  return csrf as string;
}

async function parse<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, body.error ?? kindOf(r.status), body.message ?? "");
  return body as T;
}

export async function get<T = any>(path: string): Promise<T> {
  return parse<T>(await raw(path));
}

// Django's CSRF check refused the request: the server's JSON "csrf" error, or (from a server
// before 27 Nov 2026) Django's own HTML 403 page. The view never ran, so sending it again is safe.
async function csrfRefused(r: Response): Promise<boolean> {
  if (r.status !== 403) return false;
  if (!(r.headers.get("content-type") ?? "").includes("application/json")) return true;
  const body = await r.clone().json().catch(() => ({}));
  return body.error === "csrf";
}

async function send(path: string, data: unknown): Promise<Response> {
  const t = await token();
  return raw(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": t },
    body: JSON.stringify(data),
  });
}

// Every change carries the session's CSRF token. Signing in replaces it (Django), so the sign-in
// screen fetches a fresh one at once (refreshCsrf); and a request the CSRF check refuses is sent
// once more with a fresh token before the page shows the security-check message (Mo, 27 Nov 2026).
export async function post<T = any>(path: string, data: unknown = {}): Promise<T> {
  let r = await send(path, data);
  if (await csrfRefused(r)) {
    csrf = null;
    r = await send(path, data);
    if (await csrfRefused(r)) {
      csrf = null;
      throw new ApiError(403, "csrf", "The page's security token was out of date. Try again.");
    }
  }
  if (r.status === 403) csrf = null; // a new session needs a new token
  return parse<T>(r);
}

export function resetCsrf() {
  csrf = null;
}

// after signing in: the token from before is no longer valid; fetch the new one now
export async function refreshCsrf(): Promise<void> {
  csrf = null;
  await token();
}

function kindOf(status: number): string {
  if (status === 429) return "rate_limited";
  if (status === 401) return "signed_out";
  if (status === 403) return "not_allowed";
  if (status === 404) return "not_found";
  if (status === 408) return "timeout";
  return "server_error";
}

// a tool from the shared tool layer: the same answer, refusal and notes as the Claude connector
export function tool<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
  return post<T>(`/tools/${name}`, args)
    .then((r) => {
      noteResponse(name, r);
      return r;
    })
    .catch((e) => {
    if (e instanceof ApiError) return { status: "error", error: e.code, http: e.status, message: e.message, notes: [] } as T;
    throw e;
  });
}

export const imageUrl = (path: string) => API + path;
