import {
  bondReferenceSchema,
  type BondReference,
} from "./bond-reference-schema";

export const CBK_LISTING =
  "https://www.centralbank.go.ke/bills-bonds/treasury-bonds/";
export const CBK_PROSPECTUS =
  "https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/44389638_AUGUST%202026%20IFB1-2019-016%2C%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026..pdf";
const checked = "2026-11-10T21:00:00.000Z";
const entries = [
  {
    issueNumber: "IFB1/2019/016",
    isin: "KE6000005543",
    couponPercent: 11.75,
    tenor: 16,
    maturity: "2035-10-08",
    amortisationDate: "2030-10-14",
    dates:
      "2026-10-19 2027-04-19 2027-10-18 2028-04-17 2028-10-16 2029-04-16 2029-10-15 2030-04-15 2030-10-14 2031-04-14 2031-10-13 2032-04-12 2032-10-11 2033-04-11 2033-10-10 2034-04-10 2034-10-09 2035-04-09 2035-10-08",
  },
  {
    issueNumber: "IFB1/2021/018",
    isin: "KE7000003546",
    couponPercent: 12.667,
    tenor: 18,
    maturity: "2039-03-21",
    amortisationDate: "2030-04-01",
    dates:
      "2026-10-05 2027-04-05 2027-10-04 2028-04-03 2028-10-02 2029-04-02 2029-10-01 2030-04-01 2030-09-30 2031-03-31 2031-09-29 2032-03-29 2032-09-27 2033-03-28 2033-09-26 2034-03-27 2034-09-25 2035-03-26 2035-09-24 2036-03-24 2036-09-22 2037-03-23 2037-09-21 2038-03-22 2038-09-20 2039-03-21",
  },
  {
    issueNumber: "IFB1/2021/021",
    isin: "KE7000005327",
    couponPercent: 12.737,
    tenor: 21,
    maturity: "2042-08-18",
    amortisationDate: "2031-09-01",
    dates:
      "2026-09-07 2027-03-08 2027-09-06 2028-03-06 2028-09-04 2029-03-05 2029-09-03 2030-03-04 2030-09-02 2031-03-03 2031-09-01 2032-03-01 2032-08-30 2033-02-28 2033-08-29 2034-02-27 2034-08-28 2035-02-26 2035-08-27 2036-02-25 2036-08-25 2037-02-23 2037-08-24 2038-02-22 2038-08-23 2039-02-21 2039-08-22 2040-02-20 2040-08-20 2041-02-18 2041-08-19 2042-02-17 2042-08-18",
  },
];
export const reviewedBondCatalogue: BondReference[] = entries.map((entry) =>
  bondReferenceSchema.parse({
    issueNumber: entry.issueNumber,
    isin: entry.isin,
    name: `Kenya Infrastructure Bond ${entry.issueNumber}`,
    aliases: [entry.issueNumber.replace(/\/0(\d\d)$/, "/$1")],
    issuer: "Republic of Kenya",
    currency: "KES",
    instrumentType: "infrastructure",
    couponPercent: entry.couponPercent,
    couponType: "fixed",
    paymentsPerYear: 2,
    taxPercent: 0,
    tenor: entry.tenor,
    maturity: entry.maturity,
    couponDates: entry.dates.split(" "),
    scheduleStatus: "published-partial",
    amortisation: [{ date: entry.amortisationDate, percentOfOutstanding: 50 }],
    finalRedemptionPercentOfOutstanding: 100,
    redemptionConditions:
      "50% of unencumbered outstanding principal at amortisation; all remaining outstanding amounts at maturity. Amounts up to KES 1 million per CSD account are redeemed in full at amortisation. Pledged holdings may settle to the lender. Check your complete custody position before estimating repayments.",
    sourceUrl: CBK_LISTING,
    prospectusUrl: CBK_PROSPECTUS,
    verifiedAt: checked,
    retrievedAt: checked,
    verification: "prospectus-reviewed",
    sourceMetadata:
      "CBK August 2026 re-opening prospectus, pages 1-3; identity, coupon and amortisation table and explicit payment calendar visually reviewed 2026-11-10. Original issue date and publication day are not established by the re-opening settlement date. Calendar starts in 2026, not at original issuance.",
  }),
);
