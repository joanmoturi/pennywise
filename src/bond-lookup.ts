import { auxiliaryRead, auxiliaryUpdate } from "./auxiliary-storage";
import { reviewedBondCatalogue, CBK_LISTING } from "./bond-catalogue";
import {
  bondReferenceSchema,
  type BondReference,
} from "./bond-reference-schema";
import type { Bond } from "./domain";

export function normaliseBondIdentifier(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
}
export interface BondSearchResult {
  matches: BondReference[];
  suggestions: BondReference[];
  source: "live" | "cache" | "reviewed-catalogue";
  warning?: string;
}
function cbkDate(raw: string): string | undefined {
  const parts = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!parts) return undefined;
  const date = `${parts[3]}-${parts[2]}-${parts[1]}`;
  if (
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    return undefined;
  return date;
}
export function parseOfficialListingData(
  html: string,
  retrievedAt = new Date().toISOString(),
): { records: BondReference[]; conflicts: BondReference[] } {
  const document = new DOMParser().parseFromString(html, "text/html");
  const tables = [...document.querySelectorAll("table")];
  const table = tables.find((table) =>
    [...table.querySelectorAll("thead th")].some(
      (cell) => cell.textContent?.trim() === "ISIN Number",
    ),
  );
  if (!table)
    throw new Error("CBK listing layout unavailable; no data was inferred");
  const headers = [...table.querySelectorAll("thead tr:first-child th")].map(
    (cell) => cell.textContent?.trim(),
  );
  const required = [
    "Issue Date",
    "Issue No",
    "ISIN Number",
    "Tenor",
    "Maturity Date",
    "Coupon Rate",
  ];
  if (required.some((name) => !headers.includes(name)))
    throw new Error("CBK listing columns changed");
  const result: BondReference[] = [];
  const conflictingIsins = new Set<string>();
  for (const row of table.querySelectorAll("tbody tr")) {
    const cells = [...row.querySelectorAll("td")].map(
      (cell) => cell.textContent?.trim() ?? "",
    );
    const get = (name: string) => cells[headers.indexOf(name)] ?? "";
    const issueNumber = normaliseBondIdentifier(get("Issue No"));
    const isin = get("ISIN Number").toUpperCase();
    const percent = get("Coupon Rate");
    const reviewed = reviewedBondCatalogue.find((r) => r.isin === isin);
    const knownAlias =
      reviewed &&
      [reviewed.issueNumber, ...reviewed.aliases].includes(issueNumber);
    const partial = bondReferenceSchema.safeParse({
      issueNumber: knownAlias ? reviewed.issueNumber : issueNumber,
      isin,
      name: knownAlias
        ? reviewed.name
        : `Kenya ${issueNumber.startsWith("IFB") ? "Infrastructure" : "Treasury"} Bond ${issueNumber}`,
      aliases: knownAlias ? reviewed.aliases : [],
      issuer: "Republic of Kenya",
      currency: "KES",
      instrumentType: issueNumber.startsWith("IFB")
        ? "infrastructure"
        : "treasury",
      ...(/^\d+(\.\d+)?$/.test(percent)
        ? { couponPercent: Number(percent) }
        : {}),
      ...(cbkDate(get("Issue Date"))
        ? { issueDate: cbkDate(get("Issue Date")) }
        : {}),
      ...(/^\d+(\.\d+)?$/.test(get("Tenor"))
        ? { tenor: Number(get("Tenor")) }
        : {}),
      ...(cbkDate(get("Maturity Date"))
        ? { maturity: cbkDate(get("Maturity Date")) }
        : {}),
      couponDates: [],
      scheduleStatus: "unavailable",
      amortisation: [],
      sourceUrl: CBK_LISTING,
      verifiedAt: retrievedAt,
      retrievedAt,
      verification: "official-listing",
      sourceMetadata: `CBK embedded issues listing. Row issue date ${get("Issue Date")} may represent a re-opening, not original issuance. No coupon type, tax, frequency or redemption schedule inferred. Original row: ${JSON.stringify(cells)}`,
    });
    if (partial.success) {
      // Re-opening row dates must not masquerade as original issue dates.
      delete partial.data.issueDate;
      if (reviewed && knownAlias) {
        if (
          (partial.data.couponPercent !== undefined &&
            partial.data.couponPercent !== reviewed.couponPercent) ||
          (partial.data.maturity !== undefined &&
            partial.data.maturity !== reviewed.maturity)
        )
          conflictingIsins.add(partial.data.isin);
        result.push({ ...reviewed, retrievedAt });
      } else result.push(partial.data);
    }
  }
  if (!result.length) throw new Error("CBK did not return usable bond rows");
  const groups = new Map<string, BondReference>();
  for (const record of result) {
    const previous = groups.get(record.isin);
    if (
      previous &&
      (previous.issueNumber !== record.issueNumber ||
        previous.couponPercent !== record.couponPercent ||
        previous.maturity !== record.maturity)
    )
      conflictingIsins.add(record.isin);
    groups.set(record.isin, record);
  }
  const byIssue = new Map<string, string>();
  for (const record of groups.values()) {
    if (
      byIssue.has(record.issueNumber) &&
      byIssue.get(record.issueNumber) !== record.isin
    ) {
      conflictingIsins.add(record.isin);
      conflictingIsins.add(byIssue.get(record.issueNumber)!);
    }
    byIssue.set(record.issueNumber, record.isin);
  }
  return {
    records: [...groups.values()].filter(
      (record) => !conflictingIsins.has(record.isin),
    ),
    conflicts: result.filter((record) => conflictingIsins.has(record.isin)),
  };
}
export function parseOfficialListing(
  html: string,
  retrievedAt?: string,
): BondReference[] {
  const result = parseOfficialListingData(html, retrievedAt);
  if (result.conflicts.length)
    throw new Error(
      "Conflicting CBK rows or prospectus terms; no reference values were updated",
    );
  return result.records;
}
export function matchBonds(query: string, records: BondReference[]) {
  const value = normaliseBondIdentifier(query);
  if (
    value.length < 3 ||
    value.length > 160 ||
    !/^[A-Z0-9 /().-]+$/.test(value)
  )
    throw new Error(
      "Enter a bond issue number, ISIN or recognised name (3–160 characters)",
    );
  for (const predicate of [
    (r: BondReference) => r.isin === value,
    (r: BondReference) => normaliseBondIdentifier(r.issueNumber) === value,
    (r: BondReference) =>
      [r.name, ...r.aliases].some(
        (name) => normaliseBondIdentifier(name) === value,
      ),
  ]) {
    const matches = records.filter(predicate);
    if (matches.length) return { matches, suggestions: [] };
  }
  return {
    matches: [],
    suggestions: records
      .filter((r) =>
        [r.name, r.issueNumber, r.isin].some((name) =>
          normaliseBondIdentifier(name).includes(value),
        ),
      )
      .slice(0, 10),
  };
}
async function cachedReferences(): Promise<BondReference[]> {
  const cached = await auxiliaryRead<unknown>("bond-references", []);
  const parsed = bondReferenceSchema.array().safeParse(cached);
  return parsed.success ? parsed.data : [];
}
export async function lookupBond(
  query: string,
  refresh = false,
): Promise<BondSearchResult> {
  matchBonds(query, []);
  const cached = await cachedReferences();
  const conflictCache = bondReferenceSchema
    .array()
    .safeParse(await auxiliaryRead("bond-conflicts", []));
  const assertUnconflicted = (conflicts: BondReference[]) => {
    if (matchBonds(query, conflicts).matches.length)
      throw new Error(
        "Conflicting official records for this identifier. No values were applied; consult CBK or enter details manually.",
      );
  };
  if (!refresh && cached.length) {
    assertUnconflicted(conflictCache.success ? conflictCache.data : []);
    return {
      ...matchBonds(query, cached),
      source: "cache",
      warning:
        "Cached official information. Check its verification date; refresh is optional.",
    };
  }
  if (navigator.onLine) {
    try {
      const response = await fetch("/api/bond-reference", {
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error("CBK is unavailable");
      const text = await response.text();
      if (text.length > 5_000_000) throw new Error("CBK response too large");
      const { records, conflicts } = parseOfficialListingData(text);
      // Cached references are candidates only; nothing updates a saved holding.
      await auxiliaryUpdate("bond-references", () => records);
      await auxiliaryUpdate("bond-conflicts", () => conflicts);
      assertUnconflicted(conflicts);
      return {
        ...matchBonds(query, records),
        source: "live",
        warning: `Basic terms retrieved from the official listing. Detailed calendars retain their separately stated prospectus review date.${conflicts.length ? " Conflicting unrelated rows were excluded, not guessed." : ""}`,
      };
    } catch (error) {
      if (error instanceof Error && /Conflicting|Ambiguous/.test(error.message))
        throw error;
    }
  }
  const records = cached.length ? cached : reviewedBondCatalogue;
  assertUnconflicted(conflictCache.success ? conflictCache.data : []);
  return {
    ...matchBonds(query, records),
    source: cached.length ? "cache" : "reviewed-catalogue",
    warning:
      "Live CBK lookup unavailable or offline. Showing previously verified information only, not a fresh verification. Coverage may be incomplete.",
  };
}
export function referenceChanges(
  previous: BondReference | undefined,
  next: BondReference,
) {
  if (!previous) return [];
  return (Object.keys(next) as (keyof BondReference)[])
    .filter(
      (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
    )
    .map(
      (key) =>
        `${key}: ${JSON.stringify(previous[key] ?? "Unavailable")} → ${JSON.stringify(next[key])}`,
    );
}
export function bondFormPopulation(reference: BondReference): Partial<Bond> {
  const verified = bondReferenceSchema.parse(reference);
  return {
    name: verified.name,
    identifier: verified.issueNumber,
    issuer: verified.issuer,
    ...(verified.couponPercent !== undefined
      ? {
          couponBps: Math.round(verified.couponPercent * 100),
          exactCouponPercent: verified.couponPercent,
        }
      : {}),
    ...(verified.taxPercent !== undefined
      ? { taxBps: Math.round(verified.taxPercent * 100) }
      : {}),
    ...(verified.paymentsPerYear !== undefined
      ? { paymentsPerYear: verified.paymentsPerYear }
      : {}),
    ...(verified.maturity ? { maturity: verified.maturity } : {}),
    reference: verified,
  };
}
