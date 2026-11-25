// Sectors, their companies, line items and ratios: one registry on the API (spear.sectors),
// never a list on a page. Banks are the first sector, not the product.
import { get } from "./api";
import type { Lang } from "./format";

export type Company = { symbol: string; name_en: string; name_ar: string | null };
export type Item = {
  code: string;
  statement: string;
  name_en: string;
  name_ar: string | null;
  is_total: boolean;
  per_share: boolean;
};
export type Ratio = {
  code: string;
  name_en: string;
  name_ar: string | null;
  formula_en: string;
  formula_ar: string | null;
};
export type Sector = {
  key: string;
  name_en: string;
  name_ar: string;
  members: Company[];
  items: Item[];
  compare_items: string[];
  ratios: Ratio[];
};

let cache: Promise<{ sectors: Sector[] }> | null = null;
// a failed request is not kept: the next page asks again
export const meta = () =>
  (cache ??= get<{ sectors: Sector[] }>("/meta").catch((e) => {
    cache = null;
    throw e;
  }));

export const nameOf = (x: { name_en: string; name_ar: string | null } | undefined, lang: Lang, fallback = "") =>
  x ? (lang === "ar" ? x.name_ar ?? x.name_en : x.name_en) : fallback;

export function sectorOf(sectors: Sector[], symbol: string): Sector | undefined {
  return sectors.find((s) => s.members.some((m) => m.symbol === symbol));
}

// search by name or symbol, English or Arabic (Arabic letters normalised: alef forms, taa marbuta)
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

export function search(members: Company[], q: string): Company[] {
  const k = norm(q);
  if (!k) return members;
  return members.filter((m) =>
    [m.symbol, m.name_en, m.name_ar ?? ""].some((x) => norm(x).includes(k)),
  );
}
