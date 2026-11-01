import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function nav(page: Page, name: string) {
  await expect(page.locator(".app-shell")).toBeVisible();
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function dialogSave(page: Page, name = "Save") {
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function account(
  page: Page,
  name: string,
  amount: string,
  kind = "bank",
) {
  await nav(page, "Settings");
  await page
    .getByRole("button", { name: "Add account", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel("Account type").selectOption(kind);
  await dialog.getByLabel("Opening balance").fill(amount);
  await dialogSave(page);
}
async function transaction(
  page: Page,
  type: string,
  amount: string,
  description: string,
  category = "Food",
) {
  await nav(page, "Transactions");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Transaction type").selectOption(type);
  await dialog.getByLabel("Amount", { exact: true }).fill(amount);
  await dialog.getByLabel("Description", { exact: true }).fill(description);
  await dialog.getByLabel("Category", { exact: true }).fill(category);
  await dialogSave(page);
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A clearer picture. A calmer plan." }),
  ).toBeVisible();
});
test("complete accounts, income, liabilities, six bonds, budgets, recovery, windfall and scenario workflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await account(page, "TEST everyday", "200000");
  await account(page, "TEST savings", "0", "savings");
  await nav(page, "Income");
  for (const name of ["TEST consulting", "TEST freelance"]) {
    await page.getByRole("button", { name: "Add income", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Name", { exact: true })
      .fill(name);
    await page
      .getByRole("dialog")
      .getByLabel("Income type")
      .selectOption("Consulting");
    await page
      .getByRole("dialog")
      .getByLabel("Expected net amount")
      .fill("10000");
    await dialogSave(page);
  }
  await nav(page, "Obligations");
  await page
    .getByRole("button", { name: "Add liability", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Business / creditor")
    .fill("TEST business");
  await page.getByRole("dialog").getByLabel("Original principal").fill("1000");
  await dialogSave(page);
  await nav(page, "Bonds");
  for (let i = 0; i < 6; i++) {
    await page.getByRole("button", { name: "Add bond", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill(`TEST bond ${i}`);
    await dialog.getByLabel("Bond identifier").fill(`FICTIONAL-${i}`);
    await dialog.getByLabel("Issuer").fill("Fictional test issuer");
    await dialog.getByLabel("Principal held").fill("10000");
    await dialog.getByLabel("Annual coupon rate (%)").fill("10");
    await dialog.getByLabel("Expected principal maturity value").fill("10000");
    await dialogSave(page);
    const card = page.locator(".card").filter({
      has: page.getByRole("heading", { name: `TEST bond ${i}`, exact: true }),
    });
    await card.getByRole("button", { name: "Configure payment dates" }).click();
    await page
      .getByRole("dialog")
      .getByLabel("First payment date")
      .fill(i < 4 ? "2026-12-15" : "2027-02-15");
    await dialogSave(page);
  }
  await expect(page.locator(".cards h3")).toHaveCount(6);
  await nav(page, "Budgets");
  await expect(page.locator(".profile")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Add category allocation", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Category", { exact: true })
    .fill("Food");
  await page
    .getByRole("dialog")
    .getByLabel("Allocation", { exact: true })
    .fill("10000");
  await dialogSave(page);
  await transaction(page, "expense", "8000", "TEST groceries");
  await nav(page, "Receivables");
  await page
    .getByRole("button", { name: "Add receivable", exact: true })
    .click();
  await page.getByRole("dialog").getByLabel("Borrower").fill("TEST borrower");
  await page.getByRole("dialog").getByLabel("Original principal").fill("2000");
  await dialogSave(page);
  await page
    .getByRole("button", { name: "Record repayment", exact: true })
    .click();
  await dialogSave(page);
  await nav(page, "Windfalls");
  await page
    .getByRole("button", { name: "Add allocation rule", exact: true })
    .click();
  const rule = page.getByRole("dialog");
  await rule.getByLabel("Name", { exact: true }).fill("TEST repay business");
  await rule.getByLabel("Allocation target type").selectOption("liability");
  await rule
    .getByLabel("Target record")
    .selectOption({ label: "Liability: TEST business" });
  await rule
    .getByLabel("Fixed amount / percentage / reserve threshold")
    .fill("1000");
  await dialogSave(page);
  await page
    .getByLabel("Windfall receipt")
    .selectOption({ label: "Repayment: TEST borrower / KES 2,000.00" });
  await page
    .getByRole("button", { name: "Confirm allocations", exact: true })
    .click();
  await dialogSave(page, "Confirm");
  await nav(page, "Forecast");
  await page.getByRole("button", { name: "New scenario", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST no employment");
  await dialogSave(page);
  await expect(
    page.getByRole("cell", { name: "TEST no employment", exact: true }),
  ).toBeVisible();
  await page.reload();
  await nav(page, "Bonds");
  await expect(page.locator(".cards h3")).toHaveCount(6);
  expect(errors).toEqual([]);
});
test("recurring variable expenses, prepayment coverage, savings capture and retained monthly review", async ({
  page,
}) => {
  await account(page, "TEST everyday", "100000");
  await account(page, "TEST savings", "0", "savings");
  await nav(page, "Recurring Expenses");
  await page
    .getByRole("button", { name: "Add recurring expense", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("TEST Wi-Fi");
  await dialog.getByLabel("Category", { exact: true }).fill("Internet");
  await dialog.getByLabel("Expected amount").fill("3000");
  await dialogSave(page);
  await page
    .getByRole("button", { name: "Pay in Advance", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Actual advance payment").fill("15000");
  await dialogSave(page, "Confirm actual advance payment");
  await nav(page, "Prepaid Expenses");
  await expect(
    page.locator("dd").filter({ hasText: /^KES 3,000\.00$/ }),
  ).toBeVisible();
  await nav(page, "Recurring Expenses");
  await expect(
    page.getByText("prepaid", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add recurring expense", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("TEST electricity");
  await dialog.getByLabel("Category", { exact: true }).fill("Electricity");
  await dialog.getByLabel("Expense type").selectOption("variable");
  await dialog.getByLabel("Expected amount").fill("1000");
  await dialogSave(page);
  const occurrence = page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: "TEST electricity", exact: true }),
    })
    .first();
  await occurrence.getByRole("button", { name: "Adjust / skip" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("This period's expected amount")
    .fill("1200");
  await dialogSave(page);
  await occurrence.getByRole("button", { name: "Pay / additional" }).click();
  await dialogSave(page, "Confirm actual payment");
  await nav(page, "Occasional Expenses");
  await page
    .getByRole("button", { name: "Plan occasional expense", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST hair plan");
  await page.getByRole("dialog").getByLabel("Estimated amount").fill("2000");
  await dialogSave(page);
  await nav(page, "Budgets");
  await page
    .getByRole("button", { name: "Add category allocation", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Category", { exact: true })
    .fill("Food");
  await page
    .getByRole("dialog")
    .getByLabel("Allocation", { exact: true })
    .fill("10000");
  await page
    .getByRole("dialog")
    .getByLabel("Category rollover rule")
    .selectOption("manual");
  await dialogSave(page);
  await transaction(page, "expense", "8000", "TEST food");
  await nav(page, "Savings Capture");
  const food = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: /Food.*manual/ }) });
  await food.getByRole("button", { name: "Capture / decide" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Destination 1 action").selectOption("transfer");
  await dialog
    .getByLabel("Destination 1 record (if needed)")
    .selectOption({ label: "Savings account: TEST savings" });
  await dialog
    .getByLabel("I have actually made any account transfers selected above")
    .check();
  await dialogSave(page, "Confirm savings decisions");
  await expect(
    page.getByText("transfer: KES 2,000.00", { exact: false }),
  ).toBeVisible();
  await nav(page, "Monthly Review");
  await page
    .getByRole("button", { name: "Finalize monthly review", exact: true })
    .click();
  await dialogSave(page, "Confirm");
  await expect(page.getByText(/Last finalized/)).toBeVisible();
});
test("full backup download, fresh-browser restore, safety export and corruption rejection", async ({
  page,
  browser,
  isMobile,
}) => {
  await account(page, "TEST portable account", "12345.67");
  await transaction(page, "income", "100", "TEST portable receipt");
  await nav(page, "Backup Centre");
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Full Backup", exact: true })
    .first()
    .click();
  if (isMobile)
    await page
      .getByRole("link", { name: "Save prepared file", exact: true })
      .click();
  const file = await downloadEvent;
  const path = await file.path();
  expect(path).not.toBeNull();
  const contents = await readFile(path!, "utf8");
  const parsed = JSON.parse(contents);
  expect(parsed.data.accounts[0].name).toBe("TEST portable account");
  expect(parsed.integrity.digest).toHaveLength(64);
  const freshContext = await browser.newContext();
  try {
    const fresh = await freshContext.newPage();
    await fresh.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await fresh.goto("/");
    await nav(fresh, "Backup Centre");
    await fresh.getByLabel("Full backup file").setInputFiles({
      name: "portable.json",
      mimeType: "application/json",
      buffer: Buffer.from(contents),
    });
    await expect(
      fresh.getByRole("heading", { name: "Restore preview" }),
    ).toBeVisible();
    await fresh
      .getByRole("button", { name: "Restore Entire Database", exact: true })
      .click();
    const safety = fresh.waitForEvent("download");
    await dialogSave(fresh, "Confirm");
    if (isMobile)
      await fresh
        .getByRole("link", { name: "Save prepared file", exact: true })
        .click();
    await safety;
    await nav(fresh, "Transactions");
    await expect(
      fresh.getByText("TEST portable receipt", { exact: true }),
    ).toBeVisible();
    await nav(fresh, "Backup Centre");
    parsed.data.accounts[0].opening++;
    await fresh.getByLabel("Full backup file").setInputFiles({
      name: "damaged.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(parsed)),
    });
    await expect(fresh.getByRole("alert")).toContainText("integrity");
    await nav(fresh, "Transactions");
    await expect(
      fresh.getByText("TEST portable receipt", { exact: true }),
    ).toBeVisible();
  } finally {
    await freshContext.close();
  }
});
test("installed shell reloads offline, allows ledger edits and emits no external data requests", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4179") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await account(page, "TEST offline cash", "10000");
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
  await page.reload();
  await expect(
    page.getByText("Offline / local data", { exact: true }),
  ).toBeVisible();
  await transaction(page, "expense", "100", "TEST offline expense");
  await page.reload();
  await nav(page, "Transactions");
  await expect(
    page.getByText("TEST offline expense", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit TEST offline expense", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("125");
  await dialogSave(page);
  await expect(
    page.getByRole("cell", { name: "KES 125.00", exact: true }),
  ).toBeVisible();
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    )!;
    return (await fetch(link.href)).json();
  });
  expect(manifest.icons).toHaveLength(2);
  expect(manifest.display).toBe("standalone");
  expect(external).toEqual([]);
  await context.setOffline(false);
  await expect(page.locator("body")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
