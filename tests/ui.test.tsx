import { useState, type ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Context, type DialogSpec } from "../src/context";
import { FormDialog } from "../src/ui";
import { RecurringPage, MonthlyReviewPage } from "../src/pages-expenses";
import { Repository, openDatabase } from "../src/storage";
import type { State } from "../src/domain";
import { generateOccurrences } from "../src/expense-engine";
import { summary } from "../src/engine";
import { fixture, recurring, budget, tx, cash } from "./fixtures";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T09:00:00Z"));
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => vi.useRealTimers());
function Harness({
  initial,
  repo,
  children,
}: {
  initial: State;
  repo: Repository;
  children: ReactNode;
}) {
  const [state, setState] = useState(initial);
  const [dialog, setDialog] = useState<DialogSpec>();
  return (
    <Context.Provider
      value={{
        state,
        repo,
        mutate: async (action, change) =>
          setState(await repo.update(action, change)),
        dialog: setDialog,
        confirm: (title, description, action) =>
          setDialog({
            title,
            description,
            fields: [],
            values: {},
            submit: action,
          }),
        notify: () => {},
        navigate: () => {},
      }}
    >
      {children}
      {dialog && (
        <FormDialog spec={dialog} close={() => setDialog(undefined)} />
      )}
    </Context.Provider>
  );
}
it("variable recurring adjustment and payment persist end to end through the UI", async () => {
  const s = fixture();
  recurring(s, { kind: "variable" });
  generateOccurrences(s, "2026-11-01");
  const db = await openDatabase(`TEST-ui-${crypto.randomUUID()}`);
  const repo = new Repository(db);
  try {
    const initial = await repo.restore(s);
    render(
      <Harness initial={initial} repo={repo}>
        <RecurringPage />
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Adjust / skip" }));
    fireEvent.change(screen.getByLabelText("This period's expected amount"), {
      target: { value: "3200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pay / additional" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm actual payment" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const saved = await repo.read();
    expect(saved.occurrences[0].amount).toBe(cash("3200"));
    expect(summary(saved).expenses).toBe(cash("3200"));
  } finally {
    db.close();
  }
});
it("a transfer savings capture requires confirmation then updates both accounts", async () => {
  const s = fixture();
  budget(s);
  s.transactions.push(tx("expense", "8000"));
  const db = await openDatabase(`TEST-ui-${crypto.randomUUID()}`);
  const repo = new Repository(db);
  try {
    const initial = await repo.restore(s);
    render(
      <Harness initial={initial} repo={repo}>
        <MonthlyReviewPage captureOnly />
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Capture / decide" }));
    fireEvent.change(screen.getByLabelText("Destination 1 action"), {
      target: { value: "transfer" },
    });
    fireEvent.change(
      screen.getByLabelText("Destination 1 record (if needed)"),
      { target: { value: "savings" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm savings decisions" }),
    );
    await screen.findByRole("alert");
    expect((await repo.read()).captures).toHaveLength(0);
    fireEvent.click(
      screen.getByLabelText(
        "I have actually made any account transfers selected above",
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm savings decisions" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const saved = await repo.read();
    expect(saved.captures).toHaveLength(1);
    expect(summary(saved).reserves).toBe(cash("2000"));
  } finally {
    db.close();
  }
});
it("invalid financial input does not close the form or commit any data", async () => {
  const submit = vi.fn();
  render(
    <FormDialog
      spec={{
        title: "TEST money",
        fields: [{ key: "amount", label: "Amount", type: "money" }],
        values: { amount: 0 },
        submit,
      }}
      close={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Amount"), {
    target: { value: "1.001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("alert");
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
