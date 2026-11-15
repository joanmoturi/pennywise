import { describe, expect, it } from "vitest";
import { dailyOverview } from "../src/daily-overview";
import { generateOccurrences, recordPrepaid } from "../src/expense-engine";
import { ingestNotifications } from "../src/notifications";
import { fixture, recurring, prepaid, liability, cash, tx } from "./fixtures";

describe("daily priorities without financial mutations", () => {
  it("sorts overdue and near-term commitments and preserves partial repayments", () => {
    const s = fixture();
    recurring(s);
    generateOccurrences(s, "2026-12-01");
    const debt = liability(s);
    debt.due = "2026-11-08";
    s.transactions.push(
      tx("liability_repayment", "5000", { relatedId: debt.id }),
    );
    const before = structuredClone(s);
    const result = dailyOverview(s, "2026-11-04");
    expect(
      result.commitments.map((item) => [item.due, item.remaining]),
    ).toEqual([
      ["2026-11-01", cash("3000")],
      ["2026-11-08", cash("15000")],
    ]);
    expect(s).toEqual(before);
  });
  it("excludes paid, skipped, paused and prepaid recurring periods", () => {
    const s = fixture();
    recurring(s);
    generateOccurrences(s, "2026-12-01");
    s.occurrences[0].status = "skipped";
    expect(dailyOverview(s, "2026-11-04").commitments).toEqual([]);
    s.occurrences[0].status = "scheduled";
    s.transactions.push(
      tx("expense", "3000", { occurrenceId: s.occurrences[0].id }),
    );
    expect(dailyOverview(s, "2026-11-04").commitments).toEqual([]);
    s.transactions = [];
    s.recurring[0].status = "paused";
    expect(dailyOverview(s, "2026-11-04").commitments).toEqual([]);
    s.recurring[0].status = "active";
    recordPrepaid(s, prepaid());
    expect(dailyOverview(s, "2026-11-04").commitments).toEqual([]);
  });
  it("counts imported review items without posting them or counting dismissed records", () => {
    const s = fixture();
    ingestNotifications(s, {
      format: "pennywise-notification-batch",
      version: 1,
      batchId: "synthetic-batch",
      createdAt: "2026-11-15T10:00:00Z",
      candidates: ["pending", "conflict", "error", "rejected", "duplicate"].map(
        (id, index) => ({
          id,
          source: "synthetic.mpesa",
          parserId: "synthetic",
          parserVersion: "1",
          capturedAt: "2026-11-15T10:00:00Z",
          occurredAt: "2026-11-15T10:00:00Z",
          reference: id,
          amount: 100,
          currency: "KES",
          direction: "credit",
          kind: "received",
          counterparty: "TEST sender",
          fee: 0,
          confidence: 99,
          missing: [],
          validation: "valid",
          fingerprint: index.toString(16).padStart(64, "a"),
        }),
      ),
    });
    s.notifications.inbox.forEach((record, i) => {
      record.status = (
        ["pending", "conflict", "error", "rejected", "duplicate"] as const
      )[i];
    });
    expect(dailyOverview(s).reviewCount).toBe(3);
    expect(s.transactions).toEqual([]);
  });
});
