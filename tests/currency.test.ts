import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currencies,
  initialState,
  today,
  uid,
  type State,
} from "../src/domain";
import {
  nativeBalances,
  postExchange,
  stampCurrency,
  toBase,
  fromBase,
  fetchRates,
  nativeEventRemaining,
} from "../src/currency";
import {
  accountBalances,
  eventRemaining,
  eventStatus,
  forecast,
  receiveEvent,
  summary,
  validateState,
} from "../src/engine";
import { reports } from "../src/reports";
import { decodeBackup, encryptBackup, fullBackup } from "../src/backup";
import { inspectMmfCsv, importMmf } from "../src/mmf";
import { fingerprint, previewStatement, commitStatement } from "../src/import";
import { openDatabase, Repository } from "../src/storage";

function workspace(): State {
  const s = initialState();
  s.settings.exchange = {
    automatic: false,
    quotes: [
      { currency: "USD", rate: "129", asOf: today(), source: "manual" },
      { currency: "EUR", rate: "140", asOf: today(), source: "manual" },
    ],
  };
  s.accounts = [
    {
      id: "usd",
      name: "TEST USD",
      kind: "bank",
      currency: "USD",
      opening: 1290000,
      restricted: 0,
      nativeOpening: 10000,
      nativeRestricted: 0,
      openingRate: "129",
      notes: "",
    },
    {
      id: "kes",
      name: "TEST KES",
      kind: "bank",
      opening: 0,
      restricted: 0,
      notes: "",
    },
  ];
  return s;
}
function exchange(s: State) {
  postExchange(s, {
    id: "exchange",
    accountId: "usd",
    destinationId: "kes",
    sent: 1000,
    received: 120000,
    fee: 100,
    date: today(),
  });
}
afterEach(() => vi.unstubAllGlobals());

describe("native currencies and exchange accounting", () => {
  it("keeps virtual base-currency reserves separate from native cash and rejects future actual exchanges", () => {
    const s = workspace();
    s.reserves.push({
      id: "reserve",
      name: "TEST envelope",
      target: 1000,
      due: today(),
      accountId: "usd",
      priority: 1,
      contribution: 0,
      frequency: "irregular",
      emergency: false,
      notes: "",
    });
    s.transactions.push({
      id: "earmark",
      type: "reserve_transfer",
      amount: 1000,
      date: today(),
      description: "TEST earmark",
      category: "Reserve",
      subcategory: "",
      accountId: "usd",
      reserveId: "reserve",
      paymentMethod: "",
      recurringReference: "",
      notes: "",
    });
    stampCurrency(s, workspace());
    validateState(s);
    expect(s.transactions[0].nativeAmount).toBeUndefined();
    expect(nativeBalances(s).get("usd")).toBe(10000);
    expect(summary(s).reserves).toBe(1000);
    expect(summary(s).available).toBe(1289000);
    const before = structuredClone(s);
    expect(() =>
      postExchange(s, {
        id: "future",
        accountId: "usd",
        destinationId: "kes",
        sent: 1000,
        received: 120000,
        fee: 0,
        date: "2200-01-01",
      }),
    ).toThrow(/future cash/);
    expect(s).toEqual(before);
  });
  it("rounds exchange conversions without floating-point amounts and enforces safe monetary bounds", () => {
    const s = workspace();
    expect(toBase(s, 101, "USD", "129.125")).toBe(13042);
    expect(toBase(s, -101, "USD", "129.125")).toBe(-13042);
    expect(fromBase(s, 12900, "USD")).toBe(100);
    expect(() => toBase(s, Number.MAX_SAFE_INTEGER, "USD")).toThrow(
      /safe monetary/,
    );
    expect(() => toBase(s, 100, "USD", "0")).toThrow(/positive/);
  });
  it("records both actual exchange legs and one fee without recording income", () => {
    const s = workspace();
    exchange(s);
    validateState(s);
    expect(nativeBalances(s).get("usd")).toBe(8900);
    expect(nativeBalances(s).get("kes")).toBe(120000);
    expect(s.transactions).toHaveLength(2);
    expect(summary(s).income).toBe(0);
    expect(summary(s).expenses).toBe(12900);
    expect(summary(s).liquid).toBe(1268100);
    const before = structuredClone(s);
    expect(() => exchange(s)).toThrow(/already recorded/);
    expect(s).toEqual(before);
  });
  it("changes current valuations but never native balances, booked history or historical expenses when rates change", () => {
    const s = workspace();
    exchange(s);
    const ledger = structuredClone(s.transactions);
    const before = reports(s, today(), today());
    s.settings.exchange!.quotes[0].rate = "150";
    expect(nativeBalances(s).get("usd")).toBe(8900);
    expect(accountBalances(s).get("usd")).toBe(1335000);
    expect(summary(s).expenses).toBe(12900);
    expect(summary(s).income).toBe(0);
    expect(reports(s, today(), today())).toEqual(before);
    expect(s.transactions).toEqual(ledger);
  });
  it("blocks insufficient cash, missing quotes, inconsistent backups and relabeling an account", () => {
    const s = workspace();
    const before = structuredClone(s);
    expect(() =>
      postExchange(s, {
        id: "x",
        accountId: "usd",
        destinationId: "kes",
        sent: 10000,
        received: 1,
        fee: 1,
        date: today(),
      }),
    ).toThrow(/balance/);
    expect(s).toEqual(before);
    s.settings.exchange!.quotes = [];
    expect(() => validateState(s)).toThrow(/No USD/);
    const changed = workspace();
    changed.accounts[0].currency = "EUR";
    expect(() => stampCurrency(changed, before)).toThrow(/relabel/);
    const broken = workspace();
    broken.accounts[0].opening = 12;
    expect(() => validateState(broken)).toThrow(/reconcile/);
  });
  it("imports native bank statement amounts once and keeps duplicate detection stable after a quote update", () => {
    const s = workspace();
    const rows = [
      ["date", "description", "debit", "credit"],
      [today(), "TEST USD purchase", "10.00", ""],
    ];
    const mapping = {
      date: 0,
      description: 1,
      debit: 2,
      credit: 3,
      balance: -1,
      category: "Food",
      dateFormat: "ISO" as const,
    };
    const preview = previewStatement(s, rows, mapping, "usd");
    commitStatement(s, preview);
    expect(s.transactions[0].nativeAmount).toBe(1000);
    expect(s.transactions[0].amount).toBe(129000);
    const fp = fingerprint(s.transactions[0]);
    s.settings.exchange!.quotes[0].rate = "150";
    expect(fingerprint(s.transactions[0])).toBe(fp);
    expect(previewStatement(s, rows, mapping, "usd")[0].duplicate).toBe(true);
    expect(nativeBalances(s).get("usd")).toBe(9000);
    validateState(s);
  });
  it("values only remaining native MMF payouts at current rates, preserving receipts and reinvestment", () => {
    const s = workspace();
    const month = today().slice(0, 7);
    const projection = inspectMmfCsv(
      "Month,Net interest earned,Net interest credited,Reinvested interest,Interest paid out,Separate fees,Total assets,Unfunded amount\n" +
        `${month},100,100,75,25,0,10075,0`,
      "fictional-usd.csv",
    );
    importMmf(s, projection, "usd");
    s.incomes[0].active = true;
    const e = s.events[0];
    expect(s.incomes[0].mmfStudio?.currency).toBe("USD");
    const t = receiveEvent(s, e.id, 129000, today());
    t.nativeAmount = 1000;
    t.exchangeRate = "129";
    s.transactions.push(t);
    s.settings.exchange!.quotes[0].rate = "150";
    expect(nativeEventRemaining(s, e)).toBe(1500);
    expect(eventRemaining(s, e)).toBe(225000);
    expect(eventStatus(s, e)).toBe("partially received");
    expect(s.transactions[0].amount).toBe(129000);
    const base = {
      id: "scenario",
      name: "TEST",
      days: 31,
      income: 0,
      expense: 0,
      monthlyIncome: 0,
      spendingBps: 10000,
      delayDays: 0,
      includeExpected: true,
    };
    const enabled = forecast(s, base).lines.at(-1)!.expected;
    s.incomes[0].active = false;
    expect(enabled - forecast(s, base).lines.at(-1)!.expected).toBe(225000);
    validateState(s);
  });
  it("keeps base-denominated expected payments separate from foreign cash originals", () => {
    const s = workspace();
    s.incomes.push({
      id: "salary",
      name: "TEST base salary",
      type: "Employment",
      description: "",
      amount: 258000,
      frequency: "irregular",
      reliability: "reliable",
      taxBps: 0,
      accountId: "usd",
      active: true,
      notes: "",
    });
    const event = {
      id: "pay",
      sourceId: "salary",
      kind: "income" as const,
      due: today(),
      amount: 258000,
      status: "expected" as const,
      reliability: "reliable" as const,
      notes: "",
    };
    s.events.push(event);
    const t = receiveEvent(s, event.id, 129000, today());
    s.transactions.push(t);
    stampCurrency(s, workspace());
    expect(t.nativeAmount).toBe(1000);
    expect(nativeEventRemaining(s, event)).toBe(129000);
    expect(eventRemaining(s, event)).toBe(129000);
  });
  it("restores complete and encrypted currency snapshots and rejects changing the base of existing money", async () => {
    const s = workspace();
    exchange(s);
    expect(await decodeBackup(await fullBackup(s))).toEqual(s);
    expect(
      await decodeBackup(
        await encryptBackup(s, "fictional-test-passphrase"),
        "fictional-test-passphrase",
      ),
    ).toEqual(s);
    const db = await openDatabase(`currency-test-${uid()}`);
    try {
      const repo = new Repository(db);
      await repo.update("Seed fictional currencies", (next) =>
        Object.assign(next, s),
      );
      await expect(
        repo.update("Set base currency", (next) => {
          next.settings.currency = "EUR";
        }),
      ).rejects.toThrow(/cannot be relabeled/);
      expect((await repo.read()).settings.currency).toBe("KES");
    } finally {
      db.close();
    }
  });
  it("loads public rates with no credentials, financial payload or account identifiers", async () => {
    const rates = Object.fromEntries(
      currencies.map((c) => [c, c === "KES" ? 1 : 0.5]),
    );
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: "success",
        base_code: "KES",
        time_last_update_unix: Date.parse(today()) / 1000,
        rates,
      }),
    });
    vi.stubGlobal("fetch", request);
    const result = await fetchRates("KES");
    expect(result.find((q) => q.currency === "USD")?.rate).toBe("2");
    expect(request.mock.calls[0][0]).toBe(
      "https://open.er-api.com/v6/latest/KES",
    );
    expect(request.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    expect(request.mock.calls[0][1]).not.toHaveProperty("body");
  });
  it("rejects invalid or unavailable automatic data without changing the cached/manual financial workspace", async () => {
    const s = workspace(),
      before = structuredClone(s);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchRates("KES")).rejects.toThrow(/Cached\/manual/);
    expect(s).toEqual(before);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: "success",
          base_code: "USD",
          time_last_update_unix: 0,
          rates: {},
        }),
      }),
    );
    await expect(fetchRates("KES")).rejects.toThrow(/Invalid/);
  });
});
