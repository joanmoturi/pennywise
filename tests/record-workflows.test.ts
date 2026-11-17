import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  editRecord,
  editTransaction,
  deleteRecord,
  type Collection,
} from "../src/forms";
import { Repository, openDatabase } from "../src/storage";
import type { AppContext, DialogSpec } from "../src/context";
import { fixture, tx } from "./fixtures";
import { pasteExpenses } from "../src/pasted-expenses-ui";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const kinds: Collection[] = [
  "accounts",
  "incomes",
  "liabilities",
  "receivables",
  "bonds",
  "necessities",
  "reserves",
  "budgets",
  "scenarios",
  "rules",
  "recurring",
  "occasional",
];
async function harness() {
  const db = await openDatabase(`TEST-records-${crypto.randomUUID()}`);
  const repo = new Repository(db);
  let spec: DialogSpec;
  let confirmed: () => Promise<void>;
  const app: AppContext = {
    repo,
    state: await repo.restore(fixture()),
    mutate: async (action, change) => {
      app.state = await repo.update(action, change);
    },
    dialog: (dialog) => {
      spec = dialog;
    },
    confirm: (_title, _description, action) => {
      confirmed = action;
    },
    notify: () => {},
    navigate: () => {},
  };
  return { db, repo, app, dialog: () => spec, confirm: () => confirmed() };
}
it.each(kinds)(
  "%s create, edit, invalid retry, cancellation and safe deletion preserve repository integrity",
  async (kind) => {
    const h = await harness();
    try {
      const before = await h.repo.read();
      editRecord(h.app, kind);
      expect(await h.repo.read()).toEqual(before);
      const values: Record<string, unknown> = {
        ...h.dialog().values,
        name: "TEST new record",
        ...(kind === "bonds"
          ? { identifier: "TEST-BOND", issuer: "TEST issuer" }
          : {}),
      };
      await h.dialog().submit(values);
      const created = h.app.state[kind].find((r) => r.id === values.id)!;
      expect(created.name).toBe("TEST new record");
      editRecord(h.app, kind, created);
      await h
        .dialog()
        .submit({ ...h.dialog().values, name: "TEST updated record" });
      const updated = h.app.state[kind].find((r) => r.id === values.id)!;
      expect(updated.name).toBe("TEST updated record");
      editRecord(h.app, kind, updated);
      const valid = await h.repo.read();
      await expect(
        h.dialog().submit({ ...h.dialog().values, name: "" }),
      ).rejects.toThrow();
      expect(await h.repo.read()).toEqual(valid);
      deleteRecord(h.app, kind, updated);
      if (kind === "recurring") {
        await expect(h.confirm()).rejects.toThrow(/missing recurring/);
        expect(await h.repo.read()).toEqual(valid);
      } else {
        await h.confirm();
        expect(h.app.state[kind].some((r) => r.id === values.id)).toBe(false);
      }
    } finally {
      h.db.close();
    }
  },
);
it("stale record edits cannot resurrect a deleted record or overwrite another tab's changes", async () => {
  const h = await harness();
  try {
    const original = h.app.state.accounts[0];
    editRecord(h.app, "accounts", original);
    await h.repo.update("TEST other tab", (s) => {
      s.accounts[0].notes = "TEST concurrent change";
    });
    await expect(
      h.dialog().submit({ ...h.dialog().values, name: "TEST stale" }),
    ).rejects.toThrow(/another tab/);
    expect((await h.repo.read()).accounts[0].notes).toBe(
      "TEST concurrent change",
    );
    await h.repo.update("TEST other delete", (s) => {
      s.accounts = s.accounts.filter((a) => a.id !== original.id);
    });
    await expect(
      h.dialog().submit({ ...h.dialog().values, name: "TEST stale" }),
    ).rejects.toThrow(/another tab/);
    expect(
      (await h.repo.read()).accounts.some((a) => a.id === original.id),
    ).toBe(false);
  } finally {
    h.db.close();
  }
});
it("stale delete confirmation cannot splice away a different last record", async () => {
  const h = await harness();
  try {
    const original = h.app.state.accounts[0];
    deleteRecord(h.app, "accounts", original);
    await h.repo.update("TEST competing delete", (s) => {
      s.accounts = s.accounts.filter((a) => a.id !== original.id);
    });
    const before = await h.repo.read();
    await expect(h.confirm()).rejects.toThrow(/already removed/);
    expect(await h.repo.read()).toEqual(before);
  } finally {
    h.db.close();
  }
});
it("stale ledger edits cannot overwrite a concurrent correction", async () => {
  const h = await harness();
  try {
    await h.app.mutate("TEST create", (s) =>
      s.transactions.push(tx("expense", "10")),
    );
    const record = h.app.state.transactions[0];
    editTransaction(h.app, record);
    await h.repo.update("TEST other correction", (s) => {
      s.transactions[0].amount = 2000;
    });
    await expect(
      h.dialog().submit({ ...h.dialog().values, amount: 3000 }),
    ).rejects.toThrow(/another tab/);
    expect((await h.repo.read()).transactions[0].amount).toBe(2000);
  } finally {
    h.db.close();
  }
});

it("pasted expenses exclude unchecked rows and save edited categories without a balance adjustment", async () => {
  const h = await harness();
  try {
    pasteExpenses(h.app);
    await h.dialog().submit({
      accountId: "cash",
      date: "2026-11-04",
      text: "expenses today\nMaterials 10k\nLabour 3k\nnew balance 90k",
    });
    const review = h.dialog();
    const key = (label: string) =>
      review.fields.find((field) => field.label === label)!.key;
    expect((await h.repo.read()).transactions).toHaveLength(0);
    const values = {
      ...review.values,
      [key("Include expense 2")]: false,
      [key("Expense 2 amount")]: undefined,
      [key("Expense 2 description")]: "",
      [key("Expense 2 category")]: "",
      [key("Expense 1 description")]: "TEST edited supplies",
      [key("Expense 1 category")]: "TEST operating costs",
    };
    expect(review.context!(values)).toContain("Balances match");
    await review.submit(values);
    const saved = await h.repo.read();
    expect(saved.transactions).toHaveLength(1);
    expect(saved.transactions[0]).toMatchObject({
      type: "expense",
      amount: 1000000,
      description: "TEST edited supplies",
      category: "TEST operating costs",
      accountId: "cash",
    });
    expect(saved.accounts[0].opening).toBe(10000000);
  } finally {
    h.db.close();
  }
});

it.each(["balance", "ownership"])(
  "pasted expense review refuses concurrent account %s changes",
  async (change) => {
    const h = await harness();
    try {
      pasteExpenses(h.app);
      await h.dialog().submit({
        accountId: "cash",
        date: "2026-11-04",
        text: "Materials 10k\nLabour 3k",
      });
      const review = h.dialog();
      await h.repo.update("TEST competing account edit", (state) => {
        if (change === "balance") state.accounts[0].opening += 100;
        else {
          state.businesses.push({
            id: "TEST-business",
            name: "TEST business",
            ownershipBps: 10000,
            partners: [],
            openingRetainedProfit: 0,
            notes: "",
          });
          state.accounts[0].businessId = "TEST-business";
        }
      });
      const before = await h.repo.read();
      await expect(review.submit(review.values)).rejects.toThrow(
        change === "balance" ? /balance changed/ : /ownership may have changed/,
      );
      expect(await h.repo.read()).toEqual(before);
    } finally {
      h.db.close();
    }
  },
);

it("a rejected pasted-expense batch leaves no partially written expenses", async () => {
  const h = await harness();
  try {
    pasteExpenses(h.app);
    await expect(
      h.dialog().submit({
        accountId: "cash",
        date: "2026-11-04",
        text: "business expenses today\nMaterials 10k",
      }),
    ).rejects.toThrow(/business-owned/);
    await h.dialog().submit({
      accountId: "cash",
      date: "2026-11-04",
      text: "Materials 10k\nLabour 3k",
    });
    const review = h.dialog();
    const before = await h.repo.read();
    await expect(
      review.submit({ ...review.values, date: "invalid" }),
    ).rejects.toThrow();
    expect(await h.repo.read()).toEqual(before);
  } finally {
    h.db.close();
  }
});
