import { describe, expect, it } from "vitest";
import { parseExpenseNote } from "../src/pasted-expenses";

describe("pasted expense notes", () => {
  it("parses the business example without spending the reported balance", () => {
    expect(
      parseExpenseNote(
        "business spending expenses today\nmaterials- 10k\nlabour 3k\nnew balace 3k",
      ),
    ).toEqual({
      business: true,
      expenses: [
        { description: "materials", amount: 1000000 },
        { description: "labour", amount: 300000 },
      ],
      reportedBalance: 300000,
      issues: [],
    });
  });
  it("handles currency, decimal thousands, CRLF and a negative reported balance exactly", () => {
    const parsed = parseExpenseNote(
      "expenses today\r\nPaint: KES 1,250.50\r\nLabour 1.25K\r\nclosing balance: -0.5k",
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.expenses.map((expense) => expense.amount)).toEqual([
      125050, 125000,
    ]);
    expect(parsed.reportedBalance).toBe(-50000);
  });
  it.each([
    "total 13k",
    "refund 500",
    "received 1000",
    "unreadable note",
    "materials: -500",
    "materials 1,00",
    "labour 0",
    "materials 10k labour 3k",
    "materials 100 labour 300",
  ])("requires review of unsupported or ambiguous input: %s", (line) => {
    const parsed = parseExpenseNote(`Materials 100\n${line}`);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.expenses).toHaveLength(1);
  });
  it("refuses multiple balances instead of choosing one", () => {
    expect(
      parseExpenseNote(
        "Materials 100\nbalance 500\nnew balance 300",
      ).issues.join(" "),
    ).toContain("one reported balance");
  });
  it("rejects unsafe values and oversized batches", () => {
    expect(
      parseExpenseNote("Materials 9007199254740991k").issues.length,
    ).toBeGreaterThan(0);
    expect(parseExpenseNote("x".repeat(10001)).issues.length).toBeGreaterThan(
      0,
    );
    expect(
      parseExpenseNote(
        Array.from({ length: 51 }, () => "Materials 10").join("\n"),
      ).issues.join(" "),
    ).toContain("50 expenses");
    expect(parseExpenseNote("balance 300").issues.join(" ")).toContain(
      "at least one expense",
    );
  });
});
