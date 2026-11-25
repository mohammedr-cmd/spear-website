// Numbers as the brand book sets them: thousands separated by commas, negatives in brackets,
// left-to-right even inside Arabic text. Formatting only: no figure is computed here.
export type Lang = "en" | "ar";

export function grouped(v: string): string {
  const neg = v.startsWith("-");
  const [i, f] = (neg ? v.slice(1) : v).split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (f ? `${g}.${f}` : g);
}

// a price or per-share amount: at least two decimals, never rounded (36.8 -> 36.80)
export function price(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const m = /^(-?\d+)(?:\.(\d+))?$/.exec(v);
  if (!m) return v;
  const f = (m[2] ?? "").padEnd(2, "0");
  const body = `${grouped(m[1])}.${f}`;
  return body.startsWith("-") ? `(${body.slice(1)})` : body;
}

export function figure(v: string | null | undefined): { text: string; negative: boolean } {
  if (v === null || v === undefined || v === "") return { text: "—", negative: false };
  const neg = v.startsWith("-");
  const body = grouped(v);
  return { text: neg ? `(${body})` : body, negative: neg };
}

// Spear's rounding: half up, on the exact decimal string (never binary floating point)
export function roundHalfUp(v: string, places: number): string {
  const neg = v.startsWith("-");
  let [i, f = ""] = (neg ? v.slice(1) : v).split(".");
  f = f.padEnd(places + 1, "0");
  let digits = (i + f.slice(0, places)).replace(/^0+(?=\d)/, "");
  if (Number(f[places]) >= 5) {
    // add one unit in the last place
    const arr = digits.split("").map(Number);
    let k = arr.length - 1;
    while (k >= 0) {
      if (arr[k] === 9) {
        arr[k] = 0;
        k--;
      } else {
        arr[k]++;
        break;
      }
    }
    if (k < 0) arr.unshift(1);
    digits = arr.join("");
  }
  digits = digits.padStart(places + 1, "0");
  const out = places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits;
  return neg && /[1-9]/.test(out) ? `-${out}` : out;
}

// shift a decimal string's point right by n places (x 10^n), exactly
function shift(v: string, n: number): string {
  const neg = v.startsWith("-");
  let [i, f = ""] = (neg ? v.slice(1) : v).split(".");
  f = f.padEnd(n, "0");
  const out = `${(i + f.slice(0, n)).replace(/^0+(?=\d)/, "")}.${f.slice(n) || "0"}`;
  return neg ? `-${out}` : out;
}

// a percentage the tool computed ("117.01"), or a ratio the tool returned exactly ("-0.0285...")
// shown to 2 places, half up; negatives in brackets
export function percent(v: string | null | undefined, fromRatio = false): string {
  if (v === null || v === undefined || v === "") return "—";
  const r = roundHalfUp(fromRatio ? shift(v, 2) : v, 2);
  return r.startsWith("-") ? `(${r.slice(1)}%)` : `${r}%`;
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export function day(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return lang === "ar" ? `${d} ${MONTHS_AR[m - 1]} ${y}` : `${d} ${MONTHS_EN[m - 1]} ${y}`;
}

const QUARTER_AR = ["الأول", "الثاني", "الثالث", "الرابع"];

export function period(iso: string, months: number | null, lang: Lang): string {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  if (!months) return lang === "ar" ? `${day(iso, "ar")}` : day(iso, "en");
  if (months === 12) return lang === "ar" ? `السنة المالية ${y}` : `FY${y}`;
  const q = Math.round(m / 3);
  if (months === 3) return lang === "ar" ? `الربع ${QUARTER_AR[q - 1]} ${y}` : `Q${q} ${y}`;
  return lang === "ar" ? `${months} أشهر حتى ${day(iso, "ar")}` : `${months}M to ${day(iso, "en")}`;
}

export function unit(scale: number | null, perShare: boolean, lang: Lang): string {
  if (perShare) return lang === "ar" ? "ر.س للسهم" : "SAR per share";
  if (scale === 1000) return lang === "ar" ? "بآلاف ر.س" : "SAR '000";
  if (scale === 1_000_000) return lang === "ar" ? "بملايين ر.س" : "SAR millions";
  return lang === "ar" ? "ر.س" : "SAR";
}
