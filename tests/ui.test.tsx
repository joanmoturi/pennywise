import { useState, type ReactNode } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Context, type DialogSpec } from "../src/context";
import { FormDialog, InfoHelp, PageHead, Metric } from "../src/ui";
import { RecurringPage, MonthlyReviewPage } from "../src/pages-expenses";
import { IncomePage } from "../src/pages-records";
import { Repository, openDatabase } from "../src/storage";
import type { State } from "../src/domain";
import { generateOccurrences } from "../src/expense-engine";
import { summary, eventRemaining } from "../src/engine";
import { fixture, recurring, budget, tx, cash, receivable } from "./fixtures";

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
function bondIncomeFixture(): State {
  const s = fixture();
  s.bonds.push({
    id: "TEST-bond",
    name: "TEST coupon bond",
    identifier: "TEST-COUPON",
    issuer: "Fictional test issuer",
    principal: cash("10000"),
    couponBps: 1000,
    taxBps: 1000,
    paymentsPerYear: 2,
    maturity: "2027-11-01",
    maturityValue: cash("10000"),
    accountId: "cash",
    notes: "",
  });
  for (const [id, due, status] of [
    ["TEST-due", "2026-11-01", "expected"],
    ["TEST-next", "2027-05-01", "expected"],
    ["TEST-cancelled", "2026-10-01", "cancelled"],
  ] as const)
    s.events.push({
      id,
      sourceId: "TEST-bond",
      kind: "bond",
      due,
      amount: cash("450"),
      status,
      reliability: "confirmed",
      notes: "TEST coupon",
    });
  receivable(s, "1000", "TEST-loan");
  s.events.push({
    id: "TEST-repayment",
    sourceId: "TEST-loan",
    kind: "receivable",
    due: "2026-11-01",
    amount: cash("1000"),
    status: "expected",
    reliability: "confirmed",
    notes: "",
  });
  s.transactions.push(
    tx("income", "100", {
      relatedId: "TEST-bond",
      eventId: "TEST-due",
      category: "Bond coupon",
    }),
    tx("bond_maturity", "1000", { relatedId: "TEST-bond" }),
  );
  return s;
}
it("shows bond-only income, unpaid coupon dates and actual receipts without principal or new records", async () => {
  const db = await openDatabase(`TEST-bond-income-${crypto.randomUUID()}`);
  const repo = new Repository(db);
  try {
    const initial = await repo.restore(bondIncomeFixture());
    render(
      <Harness initial={initial} repo={repo}>
        <IncomePage />
      </Harness>,
    );
    const region = screen.getByRole("region", { name: "Bond coupon income" });
    expect(
      within(region).getByRole("heading", { name: "TEST coupon bond" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Build your income picture"),
    ).not.toBeInTheDocument();
    expect(
      within(region).getByText("Actual received").nextElementSibling,
    ).toHaveTextContent("KES 100.00");
    expect(
      within(region).getByText("Next unpaid coupon").nextElementSibling,
    ).toHaveTextContent("2026-11-01");
    expect(
      within(region).getByText("Still expected").nextElementSibling,
    ).toHaveTextContent("KES 350.00 / partially received");
    expect(
      screen.queryByRole("cell", { name: /TEST borrower/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(region).getByText("Recent coupon receipts (1)"));
    expect(
      within(region).getByRole("cell", { name: "KES 100.00" }),
    ).toBeInTheDocument();
    expect(
      within(region).queryByRole("cell", { name: "KES 1,000.00" }),
    ).not.toBeInTheDocument();
    expect(await repo.read()).toEqual(initial);
  } finally {
    db.close();
  }
});
it("receives an existing bond coupon from Income without creating another income source or schedule", async () => {
  const db = await openDatabase(`TEST-bond-receipt-${crypto.randomUUID()}`);
  const repo = new Repository(db);
  try {
    const initial = await repo.restore(bondIncomeFixture());
    render(
      <Harness initial={initial} repo={repo}>
        <IncomePage />
      </Harness>,
    );
    const row = screen
      .getByRole("cell", { name: /Remaining: KES 350\.00/ })
      .closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Receive" }));
    expect(screen.getByLabelText("Actual amount received")).toHaveValue(
      "350.00",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const saved = await repo.read();
    expect(saved.incomes).toHaveLength(0);
    expect(saved.events).toEqual(initial.events);
    expect(saved.transactions.filter((t) => t.type === "income")).toHaveLength(
      2,
    );
    expect(eventRemaining(saved, saved.events[0])).toBe(0);
    expect(summary(saved).income).toBe(cash("450"));
    const region = screen.getByRole("region", { name: "Bond coupon income" });
    expect(
      within(region).getByText("Actual received").nextElementSibling,
    ).toHaveTextContent("KES 450.00");
    expect(
      within(region).getByText("Next unpaid coupon").nextElementSibling,
    ).toHaveTextContent("2027-05-01");
  } finally {
    db.close();
  }
});
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
it("rapid repeated submissions run once, show saving and retain input after a failed write", async () => {
  let rejectWrite: (reason: Error) => void = () => {};
  const submit = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectWrite = reject;
      }),
  );
  const close = vi.fn();
  render(
    <FormDialog
      spec={{
        title: "TEST save guard",
        fields: [{ key: "name", label: "Name" }],
        values: { name: "TEST retained entry" },
        submit,
      }}
      close={close}
    />,
  );
  const form = screen.getByRole("dialog").querySelector("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  expect(screen.getByLabelText("Name")).toBeDisabled();
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  rejectWrite(new Error("TEST disk full"));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Name")).toHaveValue("TEST retained entry");
  expect(screen.getByLabelText("Name")).not.toBeDisabled();
  expect(screen.getByRole("alert")).toHaveFocus();
  expect(close).not.toHaveBeenCalled();
});
it("successful saves wait for persistence before closing and closing is disabled while saving", async () => {
  let finish: () => void = () => {};
  const submit = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const close = vi.fn();
  render(
    <FormDialog
      spec={{ title: "TEST commit", fields: [], values: {}, submit }}
      close={close}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled();
  finish();
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
});
it("keeps explanations on demand without hiding financial supporting values", () => {
  render(
    <>
      <PageHead title="TEST accounts" subtitle="TEST account explanation" />
      <Metric
        label="TEST cash"
        value="KES 1,000.00"
        supporting="Restricted: KES 100.00"
        hint="TEST cash explanation"
      />
    </>,
  );
  expect(
    screen.queryByText("TEST account explanation"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("TEST cash explanation")).not.toBeInTheDocument();
  expect(screen.getByText("Restricted: KES 100.00")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", {
      name: "TEST accounts information",
    }),
  );
  expect(
    screen.getByRole("region", { name: "About TEST accounts" }),
  ).toHaveTextContent("TEST account explanation");
  fireEvent.click(
    screen.getByRole("button", { name: "TEST cash information" }),
  );
  expect(
    screen.queryByRole("region", { name: "About TEST accounts" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "About TEST cash" }),
  ).toHaveTextContent("TEST cash explanation");
});
it("pins help on click, toggles it off and dismisses on outside input or Escape", () => {
  render(
    <>
      <InfoHelp label="TEST help">TEST details</InfoHelp>
      <input aria-label="TEST outside" />
    </>,
  );
  const trigger = screen.getByRole("button", {
    name: "TEST help information",
  });
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(trigger).toHaveAttribute(
    "aria-controls",
    screen.getByRole("region").id,
  );
  fireEvent.click(trigger);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByLabelText("TEST outside"));
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  fireEvent.click(trigger);
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  fireEvent(document, event);
  expect(event.defaultPrevented).toBe(true);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});
it("keeps field help inside a native modal without submitting, changing inputs or breaking labels", () => {
  const submit = vi.fn();
  const close = vi.fn();
  render(
    <FormDialog
      spec={{
        title: "TEST entry",
        description: "TEST form guidance",
        fields: [
          {
            key: "amount",
            label: "Amount",
            type: "money",
            help: "TEST amount explanation",
          },
        ],
        values: { amount: cash("123.45") },
        submit,
      }}
      close={close}
    />,
  );
  const input = screen.getByLabelText("Amount", { exact: true });
  expect(input).toHaveValue("123.45");
  expect(input).not.toHaveAttribute("aria-describedby");
  expect(screen.queryByText("TEST form guidance")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Amount information" }));
  const popup = screen.getByRole("region", { name: "About Amount" });
  expect(popup.closest("dialog")).toBe(screen.getByRole("dialog"));
  expect(popup.closest("form")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Close Amount information" }),
  );
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Amount information" }),
  ).toHaveFocus();
  expect(input).toHaveValue("123.45");
  expect(submit).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
it("leaves destructive descriptions and typed reset confirmation visible", () => {
  render(
    <FormDialog
      spec={{
        title: "TEST reset",
        description: "TEST permanent deletion warning",
        fields: [{ key: "confirmation", label: "Type RESET" }],
        values: {},
        submit: async () => {},
        submitLabel: "Reset permanently",
      }}
      close={() => {}}
    />,
  );
  expect(screen.getByText("TEST permanent deletion warning")).toBeVisible();
  expect(screen.getByRole("dialog")).toHaveAttribute(
    "aria-describedby",
    "dialog-description",
  );
  expect(screen.getByLabelText("Type RESET")).toBeVisible();
});
