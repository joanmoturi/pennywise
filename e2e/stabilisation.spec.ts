import { test, expect, type Page } from "@playwright/test";

async function nav(page: Page, name: string) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", {
      name: ["Obligations", "Receivables"].includes(name) ? "Debts" : name,
      exact: true,
    })
    .click();
  if (name === "Receivables")
    await page.getByRole("tab", { name: "Owed to me", exact: true }).click();
}
async function save(page: Page, label = "Save") {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: label, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function firstAccount(page: Page) {
  await page
    .getByRole("button", { name: "Set up first account", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST save account");
  await page
    .getByRole("dialog")
    .getByLabel("Opening balance", { exact: true })
    .fill("100000");
  await save(page);
}
async function counts(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("pennywise-connected-v5");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Record<string, string[]>>((resolve, reject) => {
        const read = db
          .transaction("state")
          .objectStore("state")
          .get("current");
        read.onsuccess = () => resolve(read.result.order);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  });
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-04T09:00:00Z"));
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
});
test("offline account, budget, recurring and transaction creates and edits survive reopening", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith(new URL(page.url()).origin) &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await firstAccount(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await nav(page, "Accounts");
  await page
    .getByRole("button", { name: "Edit TEST save account", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Opening balance", { exact: true })
    .fill("120000");
  await save(page);
  await nav(page, "Budgets");
  await page.getByRole("button", { name: "New profile", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST custom budget");
  await save(page);
  await page.getByRole("button", { name: /TEST custom budget/ }).click();
  await page
    .getByRole("button", { name: "Edit budget profile", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST updated budget");
  await save(page);
  await nav(page, "Recurring Expenses");
  await page
    .getByRole("button", { name: "Add recurring expense", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("TEST monthly");
  await dialog.getByLabel("Category", { exact: true }).fill("TEST utilities");
  await dialog.getByLabel("Expected amount", { exact: true }).fill("1000");
  await save(page);
  await page
    .getByRole("button", { name: "Edit TEST monthly", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("TEST updated monthly");
  await dialog.getByLabel("Expected amount", { exact: true }).fill("1200");
  await save(page);
  await nav(page, "Transactions");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount", { exact: true }).fill("123");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("TEST offline record");
  await save(page);
  await page
    .getByRole("button", { name: "Edit TEST offline record", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("125");
  await save(page);
  await page.reload();
  await expect(
    page.getByText("Offline / local data", { exact: true }),
  ).toBeVisible();
  await nav(page, "Transactions");
  await expect(
    page.getByRole("cell", { name: "KES 125.00", exact: true }),
  ).toBeVisible();
  expect((await counts(page)).transactions).toHaveLength(1);
  await nav(page, "Accounts");
  await expect(page.locator(".big-number")).toHaveText("KES 119,875.00");
  await nav(page, "Budgets");
  await expect(
    page.getByRole("button", { name: /TEST updated budget/ }),
  ).toBeVisible();
  await nav(page, "Recurring Expenses");
  await expect(
    page.getByRole("heading", { name: "TEST updated monthly", exact: true }),
  ).toBeVisible();
  expect(external).toEqual([]);
});
test("failed quota write preserves the form, focuses errors and retries without a duplicate", async ({
  page,
}) => {
  await firstAccount(page);
  await nav(page, "Transactions");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount", { exact: true }).fill("99");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("TEST retained after quota");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "records") {
        IDBObjectStore.prototype.put = original;
        throw new DOMException(
          "TEST synthetic quota failure",
          "QuotaExceededError",
        );
      }
      return original.call(this, value, key);
    };
  });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("storage is full");
  await expect(dialog.getByRole("alert")).toBeFocused();
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue(
    "TEST retained after quota",
  );
  expect((await counts(page)).transactions).toHaveLength(0);
  await save(page);
  expect((await counts(page)).transactions).toHaveLength(1);
});
test("rapid repeated Save and Enter attempts create one committed transaction", async ({
  page,
}) => {
  await firstAccount(page);
  await nav(page, "Transactions");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount", { exact: true }).fill("10");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("TEST repeated submit");
  await dialog.locator("form").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(dialog).toHaveCount(0);
  expect((await counts(page)).transactions).toHaveLength(1);
  await page.reload();
  expect((await counts(page)).transactions).toHaveLength(1);
});
test("transaction optional fields stay accessible and transfer destinations are disclosed automatically", async ({
  page,
}) => {
  await firstAccount(page);
  await nav(page, "Accounts");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST second account");
  await save(page);
  await nav(page, "Transactions");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Notes", { exact: true })).toBeHidden();
  await dialog
    .getByLabel("Transaction type", { exact: true })
    .selectOption("transfer");
  await expect(
    dialog.getByLabel("Destination (transfers only)", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Destination (transfers only)", { exact: true })
    .selectOption({ label: "TEST second account" });
  await dialog.getByLabel("Amount", { exact: true }).fill("100");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("TEST owned transfer");
  await save(page);
  await nav(page, "Accounts");
  await expect(page.locator(".big-number")).toHaveText([
    "KES 99,900.00",
    "KES 100.00",
  ]);
});
test("keyboard dialog cancellation, validation association and mobile layout remain usable", async ({
  page,
}) => {
  await firstAccount(page);
  await nav(page, "Transactions");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("TEST invalid amount");
  await dialog.getByLabel("Amount", { exact: true }).fill("1.001");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeFocused();
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveAttribute(
    "aria-describedby",
    /error-amount/,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect((await counts(page)).transactions).toHaveLength(0);
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await page.keyboard.press("Escape");
});
test("a genuinely blocked write times out without a false commit and remains retryable", async ({
  page,
}) => {
  await firstAccount(page);
  await nav(page, "Transactions");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount", { exact: true }).fill("15");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("TEST blocked write");
  await page.evaluate(async () => {
    const request = indexedDB.open("pennywise-connected-v5");
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction(["state", "records"], "readwrite");
    let holding = true;
    const keepAlive = () => {
      const read = tx.objectStore("state").get("current");
      read.onsuccess = () => {
        if (holding) keepAlive();
      };
    };
    keepAlive();
    (
      window as unknown as { releaseTestStorage: () => void }
    ).releaseTestStorage = () => {
      holding = false;
      tx.oncomplete = () => db.close();
    };
  });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Saving...", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText("Still waiting", {
    timeout: 8000,
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "No changes were saved",
    { timeout: 20000 },
  );
  await page.evaluate(() =>
    (
      window as unknown as { releaseTestStorage: () => void }
    ).releaseTestStorage(),
  );
  expect((await counts(page)).transactions).toHaveLength(0);
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue(
    "TEST blocked write",
  );
  await save(page);
  expect((await counts(page)).transactions).toHaveLength(1);
});
