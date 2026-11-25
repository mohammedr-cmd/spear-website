// The one way the app talks to the Spear API on Mo's PC. Every request carries the session cookie;
// every change carries the CSRF token. A network failure or Cloudflare's tunnel error (530/1033)
// means "Spear is offline", never a broken screen.
declare const __API_URL__: string;
export const API = __API_URL__;

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

async function raw(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(API + path, { credentials: "include", ...init, signal: ctl.signal });
    if (r.status === 530 || r.status === 502 || r.status === 504) {
      setOffline(true);
      throw new Offline();
    }
    setOffline(false);
    return r;
  } catch (e) {
    if (e instanceof Offline) throw e;
    setOffline(true);
    throw new Offline();
  } finally {
    clearTimeout(timer);
  }
}

export async function health(): Promise<boolean> {
  try {
    const r = await raw("/health", {}, 5000);
    return r.ok;
  } catch {
    return false;
  }
}

async function token(): Promise<string> {
  if (csrf) return csrf;
  const r = await raw("/auth/csrf");
  csrf = (await r.json()).csrf;
  return csrf as string;
}

async function parse<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, body.error ?? "error", body.message ?? "Something went wrong.");
  return body as T;
}

export async function get<T = any>(path: string): Promise<T> {
  return parse<T>(await raw(path));
}

export async function post<T = any>(path: string, data: unknown = {}): Promise<T> {
  const t = await token();
  const r = await raw(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": t },
    body: JSON.stringify(data),
  });
  if (r.status === 403) csrf = null; // a new session needs a new token
  return parse<T>(r);
}

export function resetCsrf() {
  csrf = null;
}

// a tool from the shared tool layer: the same answer, refusal and notes as the Claude connector
export function tool<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
  return post<T>(`/tools/${name}`, args).catch((e) => {
    if (e instanceof ApiError) return { status: "error", error: e.code, message: e.message, notes: [] } as T;
    throw e;
  });
}

export const imageUrl = (path: string) => API + path;
