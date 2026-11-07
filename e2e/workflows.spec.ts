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
    .getByRole("button", {
      name: ["Obligations", "Receivables"].includes(name) ? "Debts" : name,
      exact: true,
    })
    .click();
  if (name === "Receivables")
    await page.getByRole("tab", { name: "Owed to me", exact: true }).click();
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
test("theme preferences survive reloads without changing financial records", async ({
  page,
}) => {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await account(page, "TEST theme account", "12345");
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await nav(page, "Settings");
  await expect(
    page.getByText("TEST theme account", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await nav(page, "Settings");
  await expect(
    page.getByText("TEST theme account", { exact: true }),
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
test("bond coupons appear as linked income with shared schedules and receipts, never principal or duplicate sources", async ({
  page,
  context,
}) => {
  await account(page, "TEST coupon account", "1000");
  await nav(page, "Bonds");
  await page.getByRole("button", { name: "Add bond", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("TEST linked coupon");
  await dialog.getByLabel("Bond identifier").fill("TEST-COUPON");
  await dialog.getByLabel("Issuer").fill("Fictional test issuer");
  await dialog.getByLabel("Principal held").fill("10000");
  await dialog.getByLabel("Annual coupon rate (%)").fill("10");
  await dialog.getByLabel("Applicable tax assumption (%)").fill("10");
  await dialog.getByLabel("Coupon payments per year").fill("2");
  await dialog.getByLabel("Maturity date").fill("2027-11-01");
  await dialog.getByLabel("Expected principal maturity value").fill("10000");
  await dialogSave(page);
  await nav(page, "Income");
  const region = page.getByRole("region", { name: "Bond coupon income" });
  await expect(
    region.getByRole("heading", { name: "TEST linked coupon", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Build your income picture" }),
  ).toHaveCount(0);
  await expect(region.locator(".big-number")).toHaveText("KES 450.00");
  await expect(region.locator("dl")).toContainText(
    "No unpaid dates configured",
  );
  await expect(
    region.locator("dl").getByText("KES 0.00", { exact: true }),
  ).toBeVisible();
  await region.getByRole("button", { name: "Add payment dates" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("First payment date").fill("2026-11-01");
  await dialog.getByLabel("Number of dates").fill("2");
  await dialog
    .getByLabel("Reliability", { exact: true })
    .selectOption("confirmed");
  await dialogSave(page);
  await page.getByRole("button", { name: "Add income", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("TEST ordinary income");
  await dialog.getByLabel("Income type").selectOption("Consulting");
  await dialog.getByLabel("Expected net amount").fill("100");
  await dialogSave(page);
  const ordinary = page.locator(".card").filter({
    has: page.getByRole("heading", {
      name: "TEST ordinary income",
      exact: true,
    }),
  });
  await ordinary.getByRole("button", { name: "Add payment dates" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("First payment date")
    .fill("2026-11-01");
  await dialogSave(page);
  const couponRow = () =>
    page
      .getByRole("row")
      .filter({ hasText: "TEST linked coupon" })
      .filter({
        has: page.getByRole("cell", { name: "2026-11-01", exact: true }),
      });
  await couponRow()
    .getByRole("button", { name: "Receive", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Actual amount received")
    .fill("100");
  await dialogSave(page);
  await expect(couponRow()).toContainText("partially received");
  await expect(
    region.locator("dl").getByText("KES 100.00", { exact: true }),
  ).toBeVisible();
  await nav(page, "Bonds");
  await expect(couponRow()).toContainText("Remaining: KES 350.00");
  await couponRow()
    .getByRole("button", { name: "Receive", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Actual amount received"),
  ).toHaveValue("350.00");
  await dialogSave(page);
  await page.getByRole("button", { name: "Record principal recovery" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("1000");
  await dialogSave(page);
  await nav(page, "Income");
  await expect(
    region.locator("dl").getByText("KES 450.00", { exact: true }),
  ).toBeVisible();
  await expect(region.locator("dl")).toContainText("2027-05-01");
  await expect(
    couponRow().getByRole("button", { name: "Receive" }),
  ).toHaveCount(0);
  await region.getByText("Recent coupon receipts (2)").click();
  await expect(
    region.getByRole("cell", { name: "KES 1,000.00", exact: true }),
  ).toHaveCount(0);
  const stored = await page.evaluate(async () => {
    const request = indexedDB.open("pennywise-connected-v5");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const rows = await new Promise<
        { collection: string; value: Record<string, unknown> }[]
      >((resolve, reject) => {
        const request = db
          .transaction("records")
          .objectStore("records")
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const receipts = rows.filter(
        (r) => r.collection === "transactions" && r.value.type === "income",
      );
      return {
        incomeSources: rows.filter((r) => r.collection === "incomes").length,
        bonds: rows.filter((r) => r.collection === "bonds").length,
        bondDates: rows.filter(
          (r) => r.collection === "events" && r.value.kind === "bond",
        ).length,
        receipts: receipts.length,
        actualIncome: receipts.reduce((n, r) => n + Number(r.value.amount), 0),
      };
    } finally {
      db.close();
    }
  });
  expect(stored).toEqual({
    incomeSources: 1,
    bonds: 1,
    bondDates: 2,
    receipts: 2,
    actualIncome: 45000,
  });
  await nav(page, "Accounts");
  await expect(page.locator(".big-number")).toHaveText("KES 2,450.00");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await nav(page, "Income");
  await expect(
    region.locator("dl").getByText("KES 450.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "TEST ordinary income", exact: true }),
  ).toBeVisible();
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
  const origin = new URL(page.url()).origin;
  page.on("request", (r) => {
    if (new URL(r.url()).origin !== origin && !r.url().startsWith("data:"))
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
