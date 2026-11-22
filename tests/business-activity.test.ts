import { describe, expect, it } from "vitest";
import { businessActivity } from "../src/business-activity";
import { accountBalances } from "../src/engine";
import { transactionTypes } from "../src/domain";
import { sum } from "../src/money";
import { fixture, tx, cash } from "./fixtures";

function businessFixture() {
  const state = fixture();
  state.accounts.push(
    {
      id: "business-bank",
      businessId: "business",
      name: "TEST business bank",
      kind: "bank",
      opening: cash("16000"),
      restricted: 0,
      notes: "",
    },
    {
      id: "business-mobile",
      businessId: "business",
      name: "TEST business mobile",
      kind: "mobile",
      opening: cash("5000"),
      restricted: 0,
      notes: "",
    },
    {
      id: "other-business",
      businessId: "other-business",
      name: "TEST other business",
      kind: "bank",
      opening: 0,
      restricted: 0,
      notes: "",
    },
  );
  return state;
}
describe("business transaction tracing", () => {
  it("shows dated expenses from all owned accounts without personal costs or distributions", () => {
    const state = businessFixture();
    const older = tx("expense", "10000", {
      accountId: "business-bank",
      date: "2026-11-17",
      notes: "Reviewed pasted expenses [TEST]",
    });
    const newer = tx("expense", "3000", {
      accountId: "business-mobile",
      date: "2026-11-18",
    });
    state.transactions.push(
      older,
      newer,
      tx("expense", "50"),
      tx("expense", "100", { accountId: "other-business" }),
      tx("expense", "100", {
        accountId: "business-bank",
        businessMovement: "partner_distribution",
      }),
    );
    const before = JSON.stringify(state);
    expect(
      businessActivity(state, "business").expenses.map(
        (entry) => entry.transaction.id,
      ),
    ).toEqual([newer.id, older.id]);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("separates revenue, capital, borrowing and recoveries and omits internal transfers", () => {
    const state = businessFixture();
    state.transactions.push(
      tx("income", "1000", { accountId: "business-bank" }),
      tx("transfer", "2000", {
        accountId: "cash",
        destinationId: "business-bank",
        businessMovement: "capital",
      }),
      tx("liability_draw", "3000", { accountId: "business-mobile" }),
      tx("loan_recovery", "500", { accountId: "business-bank" }),
      tx("prepaid_refund", "200", { accountId: "business-bank" }),
      tx("transfer", "1000", {
        accountId: "business-bank",
        destinationId: "business-mobile",
      }),
      tx("reserve_transfer", "400", { accountId: "business-bank" }),
    );
    const activity = businessActivity(state, "business");
    expect(sum(activity.inflows.map((entry) => entry.amount))).toBe(
      cash("6700"),
    );
    expect(activity.inflows.map((entry) => entry.kind).sort()).toEqual(
      [
        "Revenue",
        "Capital / funding",
        "Borrowed funds",
        "Loan principal recovered",
        "Expense refund",
      ].sort(),
    );
    expect(
      activity.inflows.find((entry) => entry.kind === "Capital / funding"),
    ).toMatchObject({ accountId: "business-bank", counterpartId: "cash" });
  });
  it("traces returned distributions and expense reversals as inflows without inventing revenue", () => {
    const state = businessFixture();
    state.transactions.push(
      tx("transfer", "-100", {
        accountId: "business-bank",
        destinationId: "cash",
        businessMovement: "owner_distribution",
        reversalOf: "TEST-original",
      }),
      tx("expense", "-50", {
        accountId: "business-bank",
        businessMovement: "partner_distribution",
        reversalOf: "TEST-partner",
      }),
      tx("expense", "-25", {
        accountId: "business-bank",
        reversalOf: "TEST-expense",
      }),
    );
    const activity = businessActivity(state, "business");
    expect(activity.inflows.map((entry) => entry.kind).sort()).toEqual(
      [
        "Returned owner distribution",
        "Returned partner distribution",
        "Expense reversal",
      ].sort(),
    );
    expect(sum(activity.inflows.map((entry) => entry.amount))).toBe(
      cash("175"),
    );
    expect(activity.expenses).toHaveLength(1);
    expect(activity.expenses[0].amount).toBe(cash("-25"));
  });
  it.each(
    transactionTypes.flatMap((type) =>
      [100, -100].map((amount) => ({ type, amount })),
    ),
  )(
    "matches actual ledger cash direction for $type / $amount",
    ({ type, amount }) => {
      const state = businessFixture();
      const transaction = tx(type, "1", {
        amount,
        accountId: "business-bank",
        destinationId: "cash",
      });
      state.transactions.push(transaction);
      const owned = state.accounts.filter(
        (account) => account.businessId === "business",
      );
      const balances = accountBalances(state);
      const movement = sum(
        owned.map((account) => balances.get(account.id)! - account.opening),
      );
      expect(
        sum(
          businessActivity(state, "business").inflows.map(
            (entry) => entry.amount,
          ),
        ),
      ).toBe(Math.max(0, movement));
    },
  );
});
