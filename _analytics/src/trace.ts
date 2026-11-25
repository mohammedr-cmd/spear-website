// What a failure report carries (Mo, 25 Nov 2026): the page (its route pattern), the last action
// (which control, by its name, never what was typed) and the last response's shape (keys and
// types, never values). No figures and no user input leave the browser.
import { post } from "./api";

let lastAction = "";
let lastShape = "";

// a control's name: its label or its visible text, for buttons only; inputs and menus by id
function describe(el: Element | null): string {
  const c = el?.closest("button, select, input, summary, a, [role=button]");
  if (!c) return "";
  const tag = c.tagName.toLowerCase();
  if (tag === "input" || tag === "select") {
    const type = (c as HTMLInputElement).type;
    return `${tag}${type ? `[${type}]` : ""}#${c.id || "?"}`;
  }
  const label = c.getAttribute("aria-label") ?? (c.textContent ?? "");
  return `${tag}: ${label.trim().slice(0, 60)}`;
}

export function watchActions() {
  for (const ev of ["click", "change"] as const) {
    document.addEventListener(ev, (e) => {
      const d = describe(e.target as Element);
      if (d) lastAction = `${ev} ${d}`;
    }, true);
  }
}

// keys and types only: {data:[{date:str,close:str}]×250, notes:[str]×3}
export function shapeOf(x: unknown, depth = 0): string {
  if (x === null) return "null";
  if (Array.isArray(x)) return x.length ? `[${shapeOf(x[0], depth + 1)}]×${x.length}` : "[]";
  if (typeof x === "object") {
    if (depth > 3) return "{…}";
    const keys = Object.keys(x as object).slice(0, 12);
    return `{${keys.map((k) => `${k}:${shapeOf((x as Record<string, unknown>)[k], depth + 1)}`).join(",")}}`;
  }
  return typeof x === "string" ? "str" : typeof x === "number" ? "num" : typeof x;
}

export function noteResponse(tool: string, res: unknown) {
  lastShape = `${tool}: ${shapeOf(res)}`.slice(0, 2000);
}

const route = () => window.location.pathname.replace(/\/\d+(?=\/|$)/g, "/:symbol");

// whether the report was stored: the page says "reported" only when it was
export function reportFailure(error: unknown, component = ""): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error("[spear] a part of the page failed", { page: route(), action: lastAction, shape: lastShape, message });
  return post("/client-errors", {
    page: route(),
    action: lastAction,
    shape: lastShape,
    message: message.slice(0, 500),
    component: component.slice(0, 300),
  })
    .then(() => true)
    .catch(() => false);
}
