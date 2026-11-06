import { test, expect, devices, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { State } from "../src/domain";
import { summary, budgetStats, forecast, eventRemaining } from "../src/engine";
import { businessStats } from "../src/connected-finance";
import { effectiveAllocations, monthlyReview } from "../src/expense-engine";
import { baseScenario } from "../src/forms";

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
async function save(page: Page, label = "Save") {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: label, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function state(page: Page): Promise<State> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pennywise-private");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(["state", "records"]);
        const request = tx.objectStore("state").get("current");
        request.onsuccess = () => {
          const meta = request.result;
          const all = tx.objectStore("records").getAll();
          all.onsuccess = () => {
            const byId = new Map(
              all.result.map((r) => [
                JSON.stringify([r.collection, r.id]),
                r.value,
              ]),
            );
            const result: Record<string, unknown> = {
              version: meta.version,
              revision: meta.revision,
              settings: meta.settings,
            };
            const notifications: Record<string, unknown> = {};
            for (const [collection, ids] of Object.entries(meta.order) as [
              string,
              string[],
            ][]) {
              const rows = ids.map((id) =>
                byId.get(JSON.stringify([collection, id])),
              );
              if (collection.startsWith("notifications."))
                notifications[collection.split(".")[1]] = rows;
              else result[collection] = rows;
            }
            result.notifications = notifications;
            resolve(result as State);
          };
          all.onerror = () => reject(all.error);
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}
async function transaction(
  page: Page,
  type: string,
  amount: string,
  category: string,
  description: string,
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
  await dialog.getByLabel("Category", { exact: true }).fill(category);
  await dialog.getByLabel("Description", { exact: true }).fill(description);
  await save(page);
}
function categoryRow(page: Page, category: string) {
  return page
    .getByRole("row")
    .filter({ has: page.getByText(category, { exact: true }) });
}
test("complete connected monthly workflow reconciles every page, offline state and encrypted restore", async ({
  page,
  browser,
  isMobile,
}, testInfo) => {
  test.setTimeout(180000);
  await page.clock.setFixedTime(new Date("2026-11-06T09:00:00Z"));
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4179") &&
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Set up first account", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST monthly bank");
  await page
    .getByRole("dialog")
    .getByLabel("Opening balance", { exact: true })
    .fill("1000000");
  await save(page);
  await page
    .getByRole("button", { name: "Continue progressively", exact: true })
    .click();
  await nav(page, "Accounts");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST monthly savings");
  await page
    .getByRole("dialog")
    .getByLabel("Account type")
    .selectOption("savings");
  await page
    .getByRole("dialog")
    .getByLabel("Opening balance", { exact: true })
    .fill("20000");
  await save(page);
  await transaction(page, "income", "100000", "Salary", "TEST salary received");
  await nav(page, "Businesses");
  await page.getByRole("button", { name: "Add business", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Business name", { exact: true })
    .fill("TEST shared company");
  await page
    .getByRole("dialog")
    .getByLabel("My ownership (%)", { exact: true })
    .fill("50");
  await page
    .getByRole("dialog")
    .getByLabel("Other partners: name | percentage, one per line")
    .fill("TEST Partner | 50");
  await save(page);
  await page
    .getByRole("button", { name: "Add business account", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Account name", { exact: true })
    .fill("TEST company bank");
  await save(page);
  for (const [label, amount, description] of [
    ["Record business revenue", "200000", "TEST company revenue"],
    ["Record business expense", "40000", "TEST company costs"],
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Amount", { exact: true })
      .fill(amount);
    await page
      .getByRole("dialog")
      .getByLabel("Description", { exact: true })
      .fill(description);
    await save(page);
  }
  expect(summary(await state(page), "2026-11-06").income).toBe(10000000);
  for (const [recipient, amount] of [
    ["me", "60000"],
    ["TEST Partner", "20000"],
  ]) {
    await page
      .getByRole("button", { name: "Distribute profit", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Recipient", { exact: true })
      .selectOption(recipient === "me" ? "me" : { label: recipient });
    await page
      .getByRole("dialog")
      .getByLabel("Actual distribution", { exact: true })
      .fill(amount);
    await save(page);
  }
  const beforeProjection = (await state(page)).transactions.length;
  await page
    .getByRole("button", { name: "Plan distribution", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Projected distribution", { exact: true })
    .fill("10000");
  await page
    .getByRole("dialog")
    .getByLabel("Expected date", { exact: true })
    .fill("2026-11-20");
  await save(page);
  expect((await state(page)).transactions).toHaveLength(beforeProjection);
  const screenshots = join(process.cwd(), "docs", "images");
  await mkdir(screenshots, { recursive: true });
  const image = async (name: string) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: join(screenshots, `connected-${testInfo.project.name}-${name}.png`),
      fullPage: true,
      animations: "disabled",
    });
  };
  await image("businesses");
  await nav(page, "Forecast");
  await page
    .getByRole("button", { name: "Plan an allowance", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Allowance name", { exact: true })
    .fill("TEST November allowance");
  await page
    .getByRole("dialog")
    .getByLabel("Allowance envelope", { exact: true })
    .fill("100000");
  await page
    .getByRole("dialog")
    .getByLabel("Period start", { exact: true })
    .fill("2026-11-01");
  await page
    .getByRole("dialog")
    .getByLabel("Period end", { exact: true })
    .fill("2026-11-30");
  await save(page);
  for (const [category, amount, purpose] of [
    ["Rent", "25000", "spending"],
    ["Groceries", "15000", "spending"],
    ["Transport", "10000", "spending"],
    ["Personal", "10000", "spending"],
    ["Savings", "30000", "savings"],
    ["Miscellaneous", "10000", "spending"],
  ]) {
    await page
      .getByRole("button", { name: "Add allowance category", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Category", { exact: true })
      .fill(category);
    await page
      .getByRole("dialog")
      .getByLabel("Allocation", { exact: true })
      .fill(amount);
    await page
      .getByRole("dialog")
      .getByLabel("Allocation purpose", { exact: true })
      .selectOption(purpose);
    await save(page);
  }
  await nav(page, "Budgets");
  await page
    .getByRole("button", { name: /Allowance: TEST November allowance/ })
    .click();
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await transaction(
    page,
    "expense",
    "17000",
    "Groceries",
    "TEST overspent groceries",
  );
  await expect(page.locator(".toast")).toContainText("2,000.00 over budget");
  await transaction(
    page,
    "expense",
    "3000",
    "Unexpected repair",
    "TEST unexpected repair",
  );
  await expect(page.locator(".toast")).toContainText("unexpected / unbudgeted");
  await transaction(
    page,
    "expense",
    "6000",
    "Personal",
    "TEST personal spending",
  );
  await nav(page, "Budgets");
  await expect(categoryRow(page, "Groceries")).toContainText("Over budget");
  await expect(categoryRow(page, "Unexpected repair")).toContainText(
    "Unbudgeted",
  );
  const beforeFunding = (await state(page)).transactions;
  for (const [category, from0, amount0, from1, amount1] of [
    ["Unexpected repair", "Miscellaneous", "1000", "Transport", "2000"],
    ["Groceries", "Miscellaneous", "2000", "", "0"],
  ]) {
    await categoryRow(page, category)
      .getByRole("button", { name: "Fund expense", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Funding category 1", { exact: true })
      .selectOption(from0);
    await dialog.getByLabel("Funding amount 1", { exact: true }).fill(amount0);
    if (from1)
      await dialog
        .getByLabel("Funding category 2 (optional)", { exact: true })
        .selectOption(from1);
    await dialog
      .getByLabel("Funding amount 2 (optional)", { exact: true })
      .fill(amount1);
    await dialog
      .getByLabel("Reason for reallocation", { exact: true })
      .fill(`TEST explicit funding ${category}`);
    await save(page);
  }
  expect((await state(page)).transactions).toEqual(beforeFunding);
  await expect(categoryRow(page, "Groceries")).toContainText("Nearing limit");
  await categoryRow(page, "Unexpected repair")
    .getByText("View transactions", { exact: true })
    .click();
  await expect(categoryRow(page, "Unexpected repair")).toContainText(
    "TEST unexpected repair",
  );
  await image("budget-expenses");
  await nav(page, "Debts");
  await page
    .getByRole("button", { name: "Add liability", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Business / creditor", { exact: true })
    .fill("TEST creditor");
  await page
    .getByRole("dialog")
    .getByLabel("Original principal", { exact: true })
    .fill("20000");
  await save(page);
  await page
    .getByRole("button", { name: "Record repayment", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("5000");
  await save(page);
  await image("debts");
  await page.getByRole("tab", { name: "Owed to me", exact: true }).click();
  await page
    .getByRole("button", { name: "Add receivable", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Borrower", { exact: true })
    .fill("TEST borrower");
  await page
    .getByRole("dialog")
    .getByLabel("Original principal", { exact: true })
    .fill("10000");
  await save(page);
  await page
    .getByRole("button", { name: "Record repayment", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("3000");
  await save(page);
  await nav(page, "Forecast");
  await categoryRow(page, "Savings")
    .getByRole("button", { name: "Fund commitment", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("30000");
  await page
    .getByRole("dialog")
    .getByLabel("Description", { exact: true })
    .fill("TEST actual savings funding");
  await save(page);
  await page
    .getByRole("button", { name: "Return unspent to savings", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Unspent category", { exact: true })
    .selectOption("Personal");
  await page
    .getByRole("dialog")
    .getByLabel("Amount to return", { exact: true })
    .fill("4000");
  await page
    .getByRole("dialog")
    .getByLabel("I have actually transferred this money", { exact: true })
    .check();
  await save(page);
  await image("planning");
  const final = await state(page);
  const totals = summary(final, "2026-11-06");
  expect(totals).toMatchObject({
    liquid: 115200000,
    businessCash: 8000000,
    income: 16000000,
    expenses: 2600000,
    liabilities: 1500000,
    receivables: 700000,
    netWorth: 114400000,
    available: 108300000,
  });
  expect(
    businessStats(final, final.businesses[0].id, "2026-11-06"),
  ).toMatchObject({
    revenue: 20000000,
    expenses: 4000000,
    retained: 8000000,
    ownerDistributions: 6000000,
    partnerDistributions: 2000000,
  });
  const b = final.budgets.find((b) => b.id === final.allowances[0].budgetId)!;
  expect(budgetStats(final, b)).toMatchObject({
    planned: 9600000,
    actual: 2600000,
    funding: 3000000,
    remaining: 4000000,
  });
  expect(
    effectiveAllocations(final, b).find((a) => a.category === "Personal")!
      .amount,
  ).toBe(600000);
  expect(monthlyReview(final, b).snapshot.saved).toBe(3400000);
  const projection = forecast(final, baseScenario(), "2026-11-06");
  expect(projection.lines.find((l) => l.date === "2026-11-30")!.confirmed).toBe(
    104300000,
  );
  expect(final.transactions).toHaveLength(12);
  await nav(page, "Monthly Review");
  await expect(page.locator("#main-content")).toContainText("34,000.00");
  await nav(page, "Overview");
  await expect(page.locator(".hero-amount")).toContainText("1,083,000.00");
  await image("overview");
  await nav(page, "Accounts");
  await expect(page.locator("#main-content")).toContainText("1,144,000.00");
  await image("accounts");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator(".hero-amount")).toContainText("1,083,000.00");
  expect((await state(page)).transactions).toEqual(final.transactions);
  await page.context().setOffline(false);
  await nav(page, "Backup Centre");
  await page
    .getByLabel("Backup passphrase", { exact: true })
    .fill("TEST-only-monthly-passphrase");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Encrypted Backup", exact: true })
    .click();
  if (isMobile)
    await page
      .getByRole("link", { name: "Save prepared file", exact: true })
      .click();
  const file = await pending;
  const bytes = await readFile((await file.path())!);
  const context = await browser.newContext(isMobile ? devices["Pixel 7"] : {});
  try {
    const fresh = await context.newPage();
    await fresh.clock.setFixedTime(new Date("2026-11-06T09:00:00Z"));
    await fresh.goto("/");
    await nav(fresh, "Backup Centre");
    await fresh
      .getByLabel("Backup passphrase", { exact: true })
      .fill("TEST-only-monthly-passphrase");
    await fresh.getByLabel("Full backup file").setInputFiles({
      name: "connected.encrypted.json",
      mimeType: "application/json",
      buffer: bytes,
    });
    await expect(
      fresh.getByRole("heading", { name: "Restore preview" }),
    ).toBeVisible();
    await fresh
      .getByRole("button", { name: "Restore Entire Database", exact: true })
      .click();
    await save(fresh, "Confirm");
    const restored = await state(fresh);
    expect(restored.transactions).toEqual(final.transactions);
    expect(restored.businesses).toEqual(final.businesses);
    expect(restored.allowances).toEqual(final.allowances);
    expect(restored.budgetChanges).toEqual(final.budgetChanges);
    expect(restored.captures).toEqual(final.captures);
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("linked projected payouts and complete corrections preserve their original records", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-06T09:00:00Z"));
  await page.goto("/?example=1");
  await expect(page.locator(".app-shell")).toBeVisible();
  const initial = await state(page);
  await nav(page, "Businesses");
  await page
    .getByRole("button", { name: "Distribute profit", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Actual distribution", { exact: true }).fill("10000");
  await dialog
    .getByLabel("Apply to expected payment (optional)", { exact: true })
    .selectOption(initial.events[0].id);
  await save(page);
  let latest = await state(page);
  expect(eventRemaining(latest, latest.events[0])).toBe(0);
  expect(latest.transactions).toHaveLength(initial.transactions.length + 1);
  const history = page
    .locator("details")
    .filter({ has: page.getByText("Distribution history", { exact: true }) });
  await history.getByText("Distribution history", { exact: true }).click();
  await history
    .getByRole("button", { name: "Reverse distribution", exact: true })
    .last()
    .click();
  await save(page, "Confirm");
  latest = await state(page);
  expect(latest.transactions).toHaveLength(initial.transactions.length + 2);
  expect(eventRemaining(latest, latest.events[0])).toBe(1000000);
  expect(summary(latest, "2026-11-06").income).toBe(16000000);
  await nav(page, "Budgets");
  await page.getByText("Funding history", { exact: true }).click();
  await page
    .getByRole("button", { name: "Undo reallocation", exact: true })
    .first()
    .click();
  await save(page, "Confirm");
  latest = await state(page);
  expect(latest.budgetChanges).toHaveLength(initial.budgetChanges.length + 1);
  expect(latest.transactions).toHaveLength(initial.transactions.length + 2);
  await nav(page, "Forecast");
  await page
    .getByRole("button", { name: "Undo savings return", exact: true })
    .click();
  await save(page, "Confirm");
  latest = await state(page);
  expect(latest.captures).toHaveLength(0);
  expect(latest.transactions).toHaveLength(initial.transactions.length + 1);
  const budget = latest.budgets.find(
    (b) => b.id === latest.allowances[0].budgetId,
  )!;
  expect(
    effectiveAllocations(latest, budget).find((a) => a.category === "Personal")!
      .amount,
  ).toBe(1000000);
  await nav(page, "Debts");
  await page.getByRole("tab", { name: "I owe", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Owed to me", exact: true }),
  ).toBeFocused();
});

test("the running interface restores a genuine encrypted schema-4 deployment backup", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-06T09:00:00Z"));
  await page.goto("/");
  await nav(page, "Backup Centre");
  await page
    .getByLabel("Backup passphrase", { exact: true })
    .fill("TEST-only-backup-passphrase");
  await page
    .getByLabel("Full backup file")
    .setInputFiles(
      join(
        process.cwd(),
        "tests",
        "fixtures",
        "deployed-schema4.encrypted.json",
      ),
    );
  await expect(
    page.getByRole("heading", { name: "Restore preview" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore Entire Database", exact: true })
    .click();
  await save(page, "Confirm");
  const restored = await state(page);
  expect(restored.version).toBe(5);
  expect(restored.accounts[0].name).toBe("DEMO everyday account");
  expect(restored.businesses).toEqual([]);
  expect(restored.notifications.inbox).toEqual([]);
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  expect((await state(page)).transactions).toEqual(restored.transactions);
});
