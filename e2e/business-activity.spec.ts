import { test, expect, type Page } from "@playwright/test";
import { today, addDays } from "../src/domain";
test.use({ serviceWorkers: "block" });

async function nav(page: Page, name: string) {
  await expect(page.locator(".app-shell")).toBeVisible();
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}
async function save(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function transaction(
  page: Page,
  type: string,
  amount: string,
  description: string,
  account: string,
  destination?: string,
) {
  await nav(page, "Transactions");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Transaction type", { exact: true })
    .selectOption(type);
  await dialog.getByLabel("Amount", { exact: true }).fill(amount);
  await dialog.getByLabel("Description", { exact: true }).fill(description);
  await dialog
    .getByLabel("Category", { exact: true })
    .fill(type === "income" ? "Business revenue" : "TEST category");
  await dialog
    .getByLabel("Account", { exact: true })
    .selectOption({ label: account });
  if (destination) {
    await dialog
      .getByLabel("Destination (transfers only)", { exact: true })
      .selectOption({ label: destination });
    await dialog
      .getByLabel("Business movement (cross-ownership transfers only)", {
        exact: true,
      })
      .selectOption("capital");
  }
  await save(page);
}
async function paste(page: Page, date: string, text: string) {
  await nav(page, "Transactions");
  await page
    .getByRole("button", { name: "Paste expenses", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Paying account", { exact: true })
    .selectOption({ label: "TEST operations bank" });
  await dialog.getByLabel("Expense date", { exact: true }).fill(date);
  await dialog.getByLabel("Expense note", { exact: true }).fill(text);
  await dialog
    .getByRole("button", { name: "Review expenses", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Review pasted expenses",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Save reviewed expenses", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function ledger(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pennywise-connected-v5");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ collection: string; value: unknown }[]>(
        (resolve, reject) => {
          const read = db
            .transaction("records")
            .objectStore("records")
            .getAll();
          read.onsuccess = () =>
            resolve(
              read.result.filter((record: { collection: string }) =>
                ["accounts", "transactions"].includes(record.collection),
              ),
            );
          read.onerror = () => reject(read.error);
        },
      );
    } finally {
      db.close();
    }
  });
}

test("business history traces yesterday's pasted expenses and all labelled inflows without changing the ledger", async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15000);
  await page.goto("/");
  await nav(page, "Businesses");
  await page.getByRole("button", { name: "Add business", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Business name", { exact: true })
    .fill("TEST tracing business");
  await save(page);
  for (const [name, opening] of [
    ["TEST operations bank", "16000"],
    ["TEST operations mobile", "5000"],
  ]) {
    await page
      .getByRole("button", { name: "Add business account", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Account name", { exact: true })
      .fill(name);
    await page
      .getByRole("dialog")
      .getByLabel("Opening business cash", { exact: true })
      .fill(opening);
    await save(page);
  }
  await nav(page, "Accounts");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST personal only");
  await page
    .getByRole("dialog")
    .getByLabel("Opening balance", { exact: true })
    .fill("50000");
  await save(page);
  const yesterday = addDays(today(), -1);
  await paste(
    page,
    yesterday,
    "business spending expenses today\nmaterials- 10k\nlabour 3k\nnew balace 3k",
  );
  await transaction(
    page,
    "expense",
    "500",
    "TEST tools today",
    "TEST operations mobile",
  );
  await transaction(
    page,
    "income",
    "1000",
    "TEST client payment",
    "TEST operations bank",
  );
  await transaction(
    page,
    "transfer",
    "2000",
    "TEST owner funding",
    "TEST personal only",
    "TEST operations bank",
  );
  await transaction(
    page,
    "expense",
    "100",
    "TEST personal expense",
    "TEST personal only",
  );
  const before = await ledger(page);
  await nav(page, "Businesses");
  let history = page.getByRole("region", {
    name: "TEST tracing business transaction history",
    exact: true,
  });
  await expect(history.locator("tbody tr")).toHaveCount(3);
  await expect(history.locator("tbody tr").first()).toContainText(
    "TEST tools today",
  );
  await expect(history).toContainText("materials");
  await expect(history).toContainText("labour");
  await expect(history).not.toContainText("TEST personal expense");
  await history.getByRole("button", { name: "Yesterday", exact: true }).click();
  await expect(history.locator("tbody tr")).toHaveCount(2);
  await expect(
    history.getByLabel("Business history from", { exact: true }),
  ).toHaveValue(yesterday);
  await history
    .getByLabel("Business history search", { exact: true })
    .fill("materials");
  await expect(history.locator("tbody tr")).toHaveCount(1);
  await history.getByText("Entry details", { exact: true }).click();
  await expect(history).toContainText("Reviewed pasted expenses [");
  await history
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await history
    .getByLabel("Business history account", { exact: true })
    .selectOption({ label: "TEST operations mobile" });
  await expect(history.locator("tbody tr")).toHaveCount(1);
  await expect(history).toContainText("TEST tools today");
  await history
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await history
    .getByLabel("Business history from", { exact: true })
    .fill(today());
  await history
    .getByLabel("Business history to", { exact: true })
    .fill(yesterday);
  await expect(history.getByRole("alert")).toContainText(
    "From date must not be after",
  );
  await history
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await history.getByRole("button", { name: /^Inflows \(/ }).click();
  await expect(history.locator("tbody tr")).toHaveCount(2);
  await expect(
    history.locator("tbody tr").filter({ hasText: "TEST client payment" }),
  ).toContainText("Revenue");
  await expect(
    history.locator("tbody tr").filter({ hasText: "TEST owner funding" }),
  ).toContainText("Capital / funding");
  await expect(history).toContainText("Inflows total (filtered): KES 3,000.00");
  await context.setOffline(true);
  await history
    .getByLabel("Business history search", { exact: true })
    .fill("owner funding");
  await expect(history.locator("tbody tr")).toHaveCount(1);
  await context.setOffline(false);
  expect(await ledger(page)).toEqual(before);
  await page.reload();
  await nav(page, "Businesses");
  history = page.getByRole("region", {
    name: "TEST tracing business transaction history",
    exact: true,
  });
  await expect(history.locator("tbody tr")).toHaveCount(3);
  expect(await ledger(page)).toEqual(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);

  const archival = Array.from(
    { length: 50 },
    (_, index) =>
      `TEST archival ${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))} 1`,
  ).join("\n");
  await paste(
    page,
    addDays(today(), -3),
    `business expenses today\n${archival}`,
  );
  const pagedBefore = await ledger(page);
  await nav(page, "Businesses");
  history = page.getByRole("region", {
    name: "TEST tracing business transaction history",
    exact: true,
  });
  await expect(history.locator("tbody tr")).toHaveCount(25);
  const pagination = history.getByRole("navigation", {
    name: "Business history pages",
    exact: true,
  });
  await pagination.getByRole("button", { name: "Next", exact: true }).click();
  await expect(history.locator("tbody tr")).toHaveCount(25);
  await pagination.getByRole("button", { name: "Next", exact: true }).click();
  await expect(history.locator("tbody tr")).toHaveCount(3);
  await expect(pagination).toContainText("51-53 of 53 entries");
  await expect(
    pagination.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  expect(await ledger(page)).toEqual(pagedBefore);
});
