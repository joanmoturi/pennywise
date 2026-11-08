import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { fixture, cash } from "./fixtures";
import { inspectMmfCsv, importMmf, mmfIncome } from "../src/mmf";
import { baseScenario } from "../src/forms";
import {
  forecast,
  summary,
  receiveEvent,
  eventRemaining,
  validateState,
} from "../src/engine";
import { fullBackup, inspectBackup, encryptBackup } from "../src/backup";
import { Repository, openDatabase } from "../src/storage";

const csv = readFileSync(
  resolve("tests", "fixtures", "mmf-studio.csv"),
  "utf8",
);
const asOf = "2026-11-08";
const projection = () => inspectMmfCsv(csv, "TEST-MMF-Studio.csv");

describe("MMF Studio monthly projection imports", () => {
  it("imports the real exported precision without deducting reference tax again", () => {
    const rows = projection().rows;
    expect(rows).toHaveLength(7);
    expect(rows[1]).toEqual({
      date: "2026-11-30",
      interest: cash("100.75"),
      credited: cash("100.75"),
      reinvested: cash("75.56"),
      payout: cash("25.19"),
      fees: 0,
      assets: cash("10150.56"),
    });
    expect(inspectMmfCsv("\uFEFF" + csv, "TEST.csv").rows).toEqual(rows);
  });
  it.each([
    ["wrong export", "Month,Amount\n2026-11,100"],
    ["duplicate month", csv + csv.split("\n")[2] + "\n"],
    ["negative amount", csv.replace("100.749", "-100.749")],
    [
      "unsafe amount",
      csv.replace("100.74999999999999999999999999999", "99999999999999999999"),
    ],
    ["invalid month", csv.replace("2026-11", "2026-13")],
    ["unfunded projection", csv.replace(/,0\r?\n/, ",1\n")],
  ])(
    "rejects a %s rather than committing guessed projections",
    (_name, input) => {
      expect(() => inspectMmfCsv(input, "TEST.csv")).toThrow();
    },
  );
  it("uses only enabled payout projections, not principal, retained interest or confirmed cash", () => {
    const s = fixture();
    const before = structuredClone(s);
    const scenario = { ...baseScenario(), days: 30 };
    importMmf(s, projection(), "cash", asOf);
    expect(mmfIncome(s)?.active).toBe(false);
    expect(s.accounts).toEqual(before.accounts);
    expect(s.transactions).toEqual(before.transactions);
    expect(summary(s, asOf)).toEqual(summary(before, asOf));
    expect(forecast(s, scenario, asOf).lines).toEqual(
      forecast(before, scenario, asOf).lines,
    );
    mmfIncome(s)!.active = true;
    const expected = forecast(s, scenario, asOf).lines.at(-1)!;
    const baseline = forecast(before, scenario, asOf).lines.at(-1)!;
    expect(expected.confirmed).toBe(baseline.confirmed);
    expect(expected.expected - baseline.expected).toBe(cash("25.19"));
    expect(expected.optimistic - baseline.optimistic).toBe(cash("25.19"));
    expect(validateState(s)).toEqual(s);
  });
  it("keeps fully reinvested interest out of the cash forecast", () => {
    const s = fixture();
    const before = structuredClone(s);
    const input = projection();
    for (const row of input.rows) {
      row.payout = 0;
      row.reinvested = row.credited;
    }
    importMmf(s, input, "cash", asOf);
    mmfIncome(s)!.active = true;
    expect(mmfIncome(s)!.mmfStudio!.rows[1].reinvested).toBe(cash("100.75"));
    expect(s.events).toHaveLength(0);
    expect(forecast(s, baseScenario(), asOf).lines).toEqual(
      forecast(before, baseScenario(), asOf).lines,
    );
  });
  it("reimports once, preserves actual receipts when disabled, and rejects conflicting payment revisions", () => {
    const s = fixture();
    const input = projection();
    importMmf(s, input, "cash", asOf);
    mmfIncome(s)!.active = true;
    const event = s.events.find((event) => event.due === "2026-11-30")!;
    s.transactions.push(receiveEvent(s, event.id, cash("10"), asOf));
    const receipts = structuredClone(s.transactions);
    const originalEvent = structuredClone(event);
    importMmf(s, input, "cash", asOf);
    expect(s.incomes).toHaveLength(1);
    expect(s.events).toHaveLength(6);
    expect(event).toEqual(originalEvent);
    expect(s.transactions).toEqual(receipts);
    expect(eventRemaining(s, event)).toBe(cash("15.19"));
    mmfIncome(s)!.active = false;
    expect(summary(s, asOf).income).toBe(cash("10"));
    expect(summary(s, asOf).liquid).toBe(cash("100010"));
    const altered = structuredClone(input);
    altered.rows[1].payout = 0;
    altered.rows[1].reinvested = altered.rows[1].credited;
    const before = structuredClone(s);
    expect(() => importMmf(s, altered, "cash", asOf)).toThrow(
      /actual receipts/,
    );
    expect(s).toEqual(before);
  });
  it("does not use investment or business accounts as personal payout destinations", () => {
    const s = fixture();
    s.accounts[1].kind = "investment";
    s.accounts[2].businessId = "TEST-business";
    for (const accountId of ["missing", "other", "savings"])
      expect(() => importMmf(s, projection(), accountId, asOf)).toThrow(
        /personal/,
      );
    expect(s.incomes).toHaveLength(0);
    expect(s.events).toHaveLength(0);
  });
  it("persists MMF snapshots and disabled receipts through full and encrypted backup restore", async () => {
    const s = fixture();
    importMmf(s, projection(), "cash", asOf);
    s.transactions.push(receiveEvent(s, s.events[0].id, cash("10"), asOf));
    const db = await openDatabase(`TEST-MMF-${crypto.randomUUID()}`);
    try {
      const repo = new Repository(db);
      const saved = await repo.restore(s);
      expect((await repo.read()).incomes[0].mmfStudio).toEqual(
        s.incomes[0].mmfStudio,
      );
      for (const text of [
        await fullBackup(saved),
        await encryptBackup(saved, "TEST MMF backup password"),
      ]) {
        const restored = (await inspectBackup(text, "TEST MMF backup password"))
          .state;
        expect(restored).toEqual(saved);
        expect(mmfIncome(restored)?.active).toBe(false);
        expect(summary(restored, asOf).income).toBe(cash("10"));
      }
    } finally {
      db.close();
    }
  });
});
