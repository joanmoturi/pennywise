import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { auxiliaryUpdate } from "../src/auxiliary-storage";
import { reviewedBondCatalogue } from "../src/bond-catalogue";
import {
  matchBonds,
  lookupBond,
  parseOfficialListing,
  bondFormPopulation,
  referenceChanges,
} from "../src/bond-lookup";
import { BondLookupPanel } from "../src/bond-lookup-ui";
import { bondReferenceSchema } from "../src/bond-reference-schema";
import { coupon, validateState } from "../src/engine";
import { fixture } from "./fixtures";
import type { Bond } from "../src/domain";
import { onRequestGet } from "../functions/api/bond-reference";

const reference = reviewedBondCatalogue[1];
const listing = (rows: string[]) =>
  `<table><thead><tr>${["Issue Date", "Issue No", "ISIN Number", "Tenor", "Face Value (Kshs Millions)", "Maturity Date", "Coupon Rate", "Redemption Yield"].map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${row
          .split("|")
          .map((cell) => `<td>${cell}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
const row =
  "12/04/2021|IFB1/2021/18|KE7000003546|18|81785.6|21/03/2039|12.667|15.999";
beforeEach(async () => {
  await auxiliaryUpdate("bond-references", () => []);
  await auxiliaryUpdate("bond-conflicts", () => []);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("conservative official bond lookup", () => {
  it("reports hosted upstream refusal safely without exposing provider bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("Private upstream diagnostics", { status: 403 }),
        ),
    );
    const response = await onRequestGet();
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Pennywise-CBK-Status")).toBe("403");
    expect(await response.text()).not.toContain("Private upstream diagnostics");
  });
  it("keeps a failed hosted upstream request noncacheable and usable by the dated fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Internal network detail")),
    );
    const response = await onRequestGet();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).not.toContain("Internal network detail");
  });
  it.each([
    "IFB1/2021/018",
    "ifb1/2021/018",
    " IFB1 / 2021 / 018 ",
    "KE7000003546",
    "ke7000003546",
    "Kenya Infrastructure Bond IFB1/2021/018",
    "IFB1/2021/18",
  ])(
    "matches exact official identifiers or an explicitly verified alias: %s",
    (query) => {
      expect(matchBonds(query, reviewedBondCatalogue).matches).toEqual([
        reference,
      ]);
    },
  );
  it("does not collapse similar issue numbers or automatically choose suggestions", () => {
    expect(matchBonds("IFB1/2021/019", reviewedBondCatalogue).matches).toEqual(
      [],
    );
    const result = matchBonds("IFB1/2021", reviewedBondCatalogue);
    expect(result.matches).toEqual([]);
    expect(result.suggestions).toHaveLength(2);
  });
  it.each(["", "ab", "<script>", "x".repeat(161)])(
    "rejects invalid search %s",
    (query) => {
      expect(() => matchBonds(query, reviewedBondCatalogue)).toThrow();
    },
  );
  it("keeps all exact alternatives instead of selecting the first", () => {
    expect(
      matchBonds(reference.isin, [
        reference,
        { ...reference, maturity: "2039-03-22" },
      ]).matches,
    ).toHaveLength(2);
  });
  it("uses reviewed offline fallback without claiming fresh verification", async () => {
    const result = await lookupBond(reference.issueNumber);
    expect(result.matches[0].verifiedAt).toBe(reference.verifiedAt);
    expect(result.source).toBe("bundled-official-records");
    expect(result.warning).toMatch(/not a fresh verification/);
  });
  it("parses coupon rather than redemption yield, preserving exact rate and dates", () => {
    const records = parseOfficialListing(listing([row]));
    expect(records[0].couponPercent).toBe(12.667);
    expect(records[0].maturity).toBe("2039-03-21");
    expect(records[0].couponDates).toEqual(reference.couponDates);
    expect(records[0].issueDate).toBeUndefined();
  });
  it("leaves unverified prospectus, tax, type and schedule blank for a listing-only issue", () => {
    const records = parseOfficialListing(
      listing([
        "01/01/2025|FXD9/2025/010|KE0000000001|10|999|01/01/2035|10.25|12.99",
      ]),
    );
    expect(records[0]).toMatchObject({
      verification: "official-listing",
      couponDates: [],
      amortisation: [],
    });
    expect(records[0].prospectusUrl).toBeUndefined();
    expect(records[0].paymentsPerYear).toBeUndefined();
    expect(records[0].taxPercent).toBeUndefined();
  });
  it("supports zero coupons without treating zero as missing", () => {
    const zero = bondReferenceSchema.parse({
      ...reference,
      couponPercent: 0,
      couponType: "zero",
    });
    expect(bondFormPopulation(zero).exactCouponPercent).toBe(0);
  });
  it("rejects a changed layout, conflicting official rows and conflicting prospectus terms", () => {
    expect(() => parseOfficialListing("<p>Blocked</p>")).toThrow();
    expect(() =>
      parseOfficialListing(listing([row.replace("12.667", "12.668")])),
    ).toThrow(/Conflicting/);
    const other =
      "01/01/2025|FXD9/2025/010|KE0000000001|10|999|01/01/2035|10.25|12.99";
    expect(() =>
      parseOfficialListing(listing([other, other.replace("10.25", "10.26")])),
    ).toThrow(/Conflicting/);
  });
  it("retrieves and caches successful official records; refresh exposes differences without touching holdings", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const fetch = vi.fn().mockResolvedValue(new Response(listing([row])));
    vi.stubGlobal("fetch", fetch);
    const result = await lookupBond(reference.isin, true);
    expect(result.source).toBe("live");
    expect((await lookupBond(reference.isin)).source).toBe("cache");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      referenceChanges(reference, { ...reference, couponPercent: 10 }),
    ).toContain("couponPercent: 12.667 → 10");
  });
  it("does not downgrade conflicting refreshes into a valid cached success", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(listing([row.replace("12.667", "11.667")])),
        ),
    );
    await expect(lookupBond(reference.isin, true)).rejects.toThrow(
      /Conflicting/,
    );
  });
  it("quarantines unrelated conflicting rows while retaining valid lookup and blocks those conflicts from cache", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const conflicting =
      "01/01/2025|FXD9/2025/010|KE0000000001|10|999|01/01/2035|10.25|12.99";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            listing([row, conflicting, conflicting.replace("10.25", "10.26")]),
          ),
        ),
    );
    const result = await lookupBond(reference.isin, true);
    expect(result.matches[0].isin).toBe(reference.isin);
    await expect(lookupBond("KE0000000001")).rejects.toThrow(
      /Conflicting official/,
    );
  });
  it("CBK outage leaves manual entry and previously reviewed references available", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect((await lookupBond(reference.isin, true)).source).toBe(
      "bundled-official-records",
    );
    expect((await lookupBond("IFB9/2099/999", true)).matches).toEqual([]);
  });
  it("population excludes personal holding values and leaves existing records/receipts unchanged", () => {
    const state = fixture();
    const original = structuredClone(state);
    const fields = bondFormPopulation(reference);
    for (const key of [
      "id",
      "principal",
      "maturityValue",
      "accountId",
      "notes",
      "principalAsOf",
    ])
      expect(fields).not.toHaveProperty(key);
    expect(state).toEqual(original);
  });
  it("retains legacy bond calculations and preserves precise fractional basis points", () => {
    const bond: Bond = {
      id: "bond",
      name: "Synthetic",
      identifier: "Synthetic",
      issuer: "Synthetic",
      principal: 100000000,
      couponBps: 1267,
      taxBps: 0,
      paymentsPerYear: 2,
      maturity: "2039-03-21",
      maturityValue: 100000000,
      accountId: "cash",
      notes: "",
    };
    expect(coupon(bond).net).toBe(6335000);
    expect(coupon({ ...bond, ...bondFormPopulation(reference) }).net).toBe(
      6333500,
    );
    const state = fixture();
    state.bonds.push({ ...bond, ...bondFormPopulation(reference) });
    expect(validateState(state).bonds[0].reference?.isin).toBe(reference.isin);
  });
  it("applies future amortisation only with explicit personal principal date and estimate choice", () => {
    const bond: Bond = {
      id: "bond",
      name: "Synthetic",
      identifier: "Synthetic",
      issuer: "Synthetic",
      principal: 100000000,
      couponBps: 1000,
      exactCouponPercent: 10,
      taxBps: 0,
      paymentsPerYear: 2,
      maturity: "2039-03-21",
      maturityValue: 100000000,
      accountId: "cash",
      notes: "",
      reference,
    };
    expect(coupon(bond, "2031-03-31").net).toBe(5000000);
    const configured = {
      ...bond,
      principalAsOf: "2026-11-10",
      redemptionEstimate: "standard" as const,
    };
    expect(coupon(configured, "2030-04-01").net).toBe(5000000);
    expect(coupon(configured, "2030-09-30").net).toBe(2500000);
    expect(
      coupon(
        { ...configured, redemptionEstimate: "full-at-first" },
        "2030-09-30",
      ).net,
    ).toBe(0);
    expect(
      coupon({ ...configured, principalAsOf: "2030-04-02" }, "2031-03-31").net,
    ).toBe(5000000);
  });
  it("uses separately verified outstanding coupon principal without changing the historical asset ledger", () => {
    const bond: Bond = {
      id: "bond",
      name: "Synthetic",
      identifier: "Synthetic",
      issuer: "Synthetic",
      principal: 100000000,
      couponBps: 1000,
      taxBps: 0,
      paymentsPerYear: 2,
      maturity: "2039-03-21",
      maturityValue: 100000000,
      accountId: "cash",
      notes: "",
      couponPrincipal: 40000000,
      principalAsOf: "2026-11-10",
      redemptionEstimate: "standard",
      reference,
    };
    expect(coupon(bond, "2027-04-05").net).toBe(2000000);
    expect(coupon(bond, "2030-09-30").net).toBe(1000000);
    expect(bond.principal).toBe(100000000);
    expect(coupon(bond, "2026-10-05").net).toBe(5000000);
  });
});
describe("bond review UI", () => {
  it("requires selection, confirmation and Use These Details; never saves", async () => {
    const populate = vi.fn();
    render(
      <BondLookupPanel
        initialQuery={reference.issueNumber}
        currency="KES"
        populate={populate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find Bond Details" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Review: IFB1\/2021\/018/ }),
    );
    const use = screen.getByRole("button", { name: "Use These Details" });
    expect(use).toBeDisabled();
    expect(populate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(use);
    expect(populate).toHaveBeenCalledTimes(1);
    expect(populate.mock.calls[0][0]).not.toHaveProperty("principal");
  });
  it("offers manual entry after failed lookup and does not populate", async () => {
    const populate = vi.fn();
    render(
      <BondLookupPanel
        initialQuery="IFB9/2099/999"
        currency="KES"
        populate={populate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find Bond Details" }));
    await screen.findByText("Bond not found");
    fireEvent.click(
      screen.getByRole("button", { name: "Enter details manually" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Continue with the manual fields/),
      ).toBeInTheDocument(),
    );
    expect(populate).not.toHaveBeenCalled();
  });
  it("does not populate Kenyan terms into a different currency workspace", async () => {
    render(
      <BondLookupPanel
        initialQuery={reference.isin}
        currency="USD"
        populate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Find Bond Details" }));
    fireEvent.click(await screen.findByRole("button", { name: /Review:/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("button", { name: "Use These Details" }),
    ).toBeDisabled();
  });
});
