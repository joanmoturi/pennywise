import { test, expect, type Page } from "@playwright/test";
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
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pennywise-connected-v5");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<
        {
          collection: string;
          value: { type?: string; amount?: number; opening?: number };
        }[]
      >((resolve, reject) => {
        const read = db.transaction("records").objectStore("records").getAll();
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  });
}
test("pasted business expenses are reviewed offline, reconcile without balance overrides, and reject a repeated batch", async ({
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
    .fill("TEST pasted expenses business");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add business account", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Account name", { exact: true })
    .fill("TEST business bank");
  await page
    .getByRole("dialog")
    .getByLabel("Opening business cash", { exact: true })
    .fill("16000");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Transactions");
  await context.setOffline(true);
  const note =
    "business spending expenses today\nmaterials- 10k\nlabour 3k\nnew balace 3k";
  const open = async () => {
    await page
      .getByRole("button", { name: "Paste expenses", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Paying account", { exact: true })
      .selectOption({ label: "TEST business bank" });
    await dialog.getByLabel("Expense note", { exact: true }).fill(note);
    return dialog;
  };
  let dialog = await open();
  await dialog
    .getByLabel("Expense note", { exact: true })
    .fill("x".repeat(10001));
  await dialog
    .getByRole("button", { name: "Review expenses", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("10,000 characters");
  await dialog
    .getByLabel("Expense note", { exact: true })
    .fill(note + "\ntotal 13k");
  await dialog
    .getByRole("button", { name: "Review expenses", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("unsupported totals");
  await dialog.getByLabel("Expense note", { exact: true }).fill(note);
  await dialog
    .getByRole("button", { name: "Review expenses", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Review pasted expenses",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Balances match");
  expect(
    (await records(page)).filter((row) => row.collection === "transactions"),
  ).toHaveLength(0);
  await dialog.getByLabel("Expense 2 amount", { exact: true }).fill("2000");
  await expect(dialog).toContainText("Difference: KES 1,000.00");
  await dialog
    .getByRole("button", { name: "Save reviewed expenses", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "reported balance differs",
  );
  expect(
    (await records(page)).filter((row) => row.collection === "transactions"),
  ).toHaveLength(0);
  await dialog
    .getByLabel("I reviewed any difference from the reported balance", {
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Save reviewed expenses", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let saved = await records(page);
  expect(
    saved
      .filter((row) => row.collection === "transactions")
      .map((row) => row.value.amount)
      .sort((a, b) => a! - b!),
  ).toEqual([200000, 1000000]);
  expect(
    saved
      .filter((row) => row.collection === "transactions")
      .every((row) => row.value.type === "expense"),
  ).toBe(true);
  expect(
    saved.find((row) => row.collection === "accounts")?.value.opening,
  ).toBe(1600000);
  dialog = await open();
  await dialog
    .getByRole("button", { name: "Review expenses", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Review pasted expenses",
    exact: true,
  });
  await dialog.getByLabel("Expense 2 amount", { exact: true }).fill("2000");
  await dialog
    .getByLabel("I reviewed any difference from the reported balance", {
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Save reviewed expenses", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("already recorded");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  dialog = await open();
  await dialog
    .getByRole("button", { name: "Review expenses", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Review pasted expenses",
    exact: true,
  });
  await dialog.getByLabel("Include expense 1", { exact: true }).uncheck();
  await dialog.getByLabel("Include expense 2", { exact: true }).uncheck();
  await dialog
    .getByRole("button", { name: "Save reviewed expenses", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Include at least one expense",
  );
  await dialog.getByLabel("Expense 1 description", { exact: true }).fill("");
  await dialog.getByLabel("Expense 1 amount", { exact: true }).fill("");
  await dialog.getByLabel("Include expense 2", { exact: true }).check();
  await dialog.getByLabel("Expense 2 amount", { exact: true }).fill("500");
  await dialog
    .getByLabel("Expense 2 category", { exact: true })
    .fill("TEST reviewed category");
  await dialog
    .getByLabel("I reviewed any difference from the reported balance", {
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Save reviewed expenses", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await context.setOffline(false);
  await page.reload();
  saved = await records(page);
  expect(saved.filter((row) => row.collection === "transactions")).toHaveLength(
    3,
  );
  expect(
    saved.find((row) => row.collection === "accounts")?.value.opening,
  ).toBe(1600000);
});
