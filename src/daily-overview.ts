import { addDays, today, type State } from "./domain";
import { necessityRemaining, outstanding } from "./engine";
import { occurrenceRemaining } from "./expense-engine";

export interface DailyCommitment {
  id: string;
  name: string;
  due: string;
  remaining: number;
  section: string;
  kind: string;
}
export function dailyOverview(s: State, asOf = today()) {
  const until = addDays(asOf, 7);
  const commitments: DailyCommitment[] = [
    ...s.occurrences
      .filter((o) =>
        s.recurring.some(
          (r) => r.id === o.recurringId && r.status === "active",
        ),
      )
      .map((o) => ({
        id: `recurring-${o.id}`,
        name: s.recurring.find((r) => r.id === o.recurringId)!.name,
        due: o.due,
        remaining: occurrenceRemaining(s, o),
        section: "recurring",
        kind: "Recurring bill",
      })),
    ...s.necessities.map((n) => ({
      id: `necessity-${n.id}`,
      name: n.name,
      due: n.due,
      remaining: necessityRemaining(s, n.id),
      section: "budgets",
      kind: "Planned necessity",
    })),
    ...s.liabilities.map((l) => ({
      id: `debt-${l.id}`,
      name: l.name,
      due: l.due,
      remaining: outstanding(s, l.id, "liability"),
      section: "obligations",
      kind: "Debt",
    })),
  ]
    .filter((item) => item.due && item.due <= until && item.remaining > 0)
    .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
  return {
    commitments,
    reviewCount: s.notifications.inbox.filter((r) =>
      ["pending", "error", "conflict"].includes(r.status),
    ).length,
  };
}
