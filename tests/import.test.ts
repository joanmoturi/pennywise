import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  parseCsv,
  previewStatement,
  commitStatement,
  csvCell,
  transactionsCsv,
  type ColumnMapping,
} from "../src/import";
import { validateState } from "../src/engine";
import { cash, fixture, tx } from "./fixtures";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());
const mapping: ColumnMapping = {
  date: 0,
  description: 1,
  debit: 2,
  credit: 3,
  balance: 4,
  category: "Food",
  dateFormat: "ISO",
};
describe("safe bank statement import", () => {
  it("parses quoted commas, quotes, newlines and BOM", () => {
    expect(
      parseCsv(
        '\uFEFFdate,description\r\n2026-11-01,"Food, ""market""\nreceipt"\r\n',
      ),
    ).toEqual([
      ["date", "description"],
      ["2026-11-01", 'Food, "market"\nreceipt'],
    ]);
    expect(() => parseCsv('x,"broken')).toThrow(/unterminated/);
  });
  it("previews debit and credit, preserves balance and flags uncertain credits", () => {
    const rows = parseCsv(
      "date,description,debit,credit,balance\n2026-11-01,Food,20,,99980\n2026-11-01,Loan repayment,,100,100080",
    );
    const p = previewStatement(fixture(), rows, mapping, "cash");
    expect(p[0].selected).toBe(true);
    expect(p[0].transaction?.amount).toBe(cash("20"));
    expect(p[1].uncertain).toBe(true);
    expect(p[1].selected).toBe(false);
    expect(p[1].balance).toBe(cash("100080"));
  });
  it("detects duplicates both against existing ledger and within the file", () => {
    const s = fixture();
    s.transactions.push(tx("expense", "20", { description: "Food" }));
    const p = previewStatement(
      s,
      parseCsv(
        "d,desc,debit,credit\n2026-11-01,Food,20,\n2026-11-01,Water,10,\n2026-11-01,Water,10,",
      ),
      mapping,
      "cash",
    );
    expect(p.map((r) => r.duplicate)).toEqual([true, false, true]);
  });
  it("rejects future dates, invalid dates and double-sided rows", () => {
    const p = previewStatement(
      fixture(),
      parseCsv(
        "d,desc,debit,credit\n2026-11-02,Food,10,\n2026-02-30,Food,10,\n2026-11-01,Food,10,10",
      ),
      mapping,
      "cash",
    );
    expect(p.every((r) => r.error && !r.selected)).toBe(true);
  });
  it("supports configurable DMY dates", () => {
    const p = previewStatement(
      fixture(),
      parseCsv("d,desc,debit,credit\n01/11/2026,Food,20,"),
      { ...mapping, dateFormat: "DMY" },
      "cash",
    );
    expect(p[0].transaction?.date).toBe("2026-11-01");
  });
  it("imports only reviewed rows and rechecks duplicate fingerprints", () => {
    const s = fixture();
    const p = previewStatement(
      s,
      parseCsv("d,desc,debit,credit\n2026-11-01,Food,20,"),
      mapping,
      "cash",
    );
    commitStatement(s, p);
    validateState(s);
    expect(s.transactions).toHaveLength(1);
    expect(() => commitStatement(s, p)).toThrow(/Duplicate/);
  });
  it("escapes formula injection and exports reporting CSV, not backups", () => {
    expect(csvCell("=SUM(1,2)")).toBe('"\'=SUM(1,2)"');
    const s = fixture();
    s.transactions.push(tx("expense", "20"));
    const file = transactionsCsv(s, "2026-11-01", "2026-11-30");
    expect(file).toContain('"20.00"');
    expect(file).not.toContain('"opening"');
  });
});
