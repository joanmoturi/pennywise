import { test, expect, type Page } from "@playwright/test";

async function nav(page: Page, name: string) {
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
test("native currencies, actual exchange fees, automatic quotes, manual overrides and offline restore preserve history", async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-08T12:00:00Z"));
  let requests = 0;
  await page.route("https://open.er-api.com/**", async (route) => {
    requests++;
    expect(route.request().method()).toBe("GET");
    expect(route.request().postData()).toBeNull();
    expect(route.request().url()).toBe("https://open.er-api.com/v6/latest/KES");
    const codes = [
      "KES",
      "USD",
      "EUR",
      "GBP",
      "TZS",
      "ZAR",
      "CAD",
      "AUD",
      "CHF",
      "CNY",
      "NGN",
      "AED",
      "INR",
    ];
    await route.fulfill({
      json: {
        result: "success",
        base_code: "KES",
        time_last_update_unix: Date.parse("2026-11-08") / 1000,
        rates: Object.fromEntries(
          codes.map((c) => [
            c,
            c === "KES" ? 1 : c === "USD" ? 1 / 129 : 1 / 140,
          ]),
        ),
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Set up first account", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST KES bank");
  await page
    .getByRole("dialog")
    .getByLabel("Opening balance", { exact: true })
    .fill("1000");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const continuing = page.getByRole("button", {
    name: "Continue progressively",
    exact: true,
  });
  if (await continuing.isVisible()) await continuing.click();
  await nav(page, "Accounts");
  await page
    .getByRole("checkbox", {
      name: "Enable automatic exchange rates",
      exact: true,
    })
    .check();
  await expect.poll(() => requests).toBe(1);
  await page.getByText("Saved exchange rates", { exact: true }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "USD", exact: true }) }),
  ).toContainText("129");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST USD bank");
  await page
    .getByRole("dialog")
    .getByLabel("Account currency", { exact: true })
    .selectOption("USD");
  await page
    .getByRole("dialog")
    .getByLabel("Opening balance", { exact: true })
    .fill("100");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const usd = () =>
    page.locator(".card").filter({
      has: page.getByRole("heading", { name: "TEST USD bank", exact: true }),
    });
  const kes = () =>
    page.locator(".card").filter({
      has: page.getByRole("heading", { name: "TEST KES bank", exact: true }),
    });
  await expect(usd().locator(".big-number")).toHaveText("USD 100.00");
  await page
    .getByRole("button", { name: "Exchange currency", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Source account", { exact: true })
    .selectOption({ label: "TEST USD bank (USD)" });
  await dialog
    .getByLabel("Receiving account", { exact: true })
    .selectOption({ label: "TEST KES bank (KES)" });
  await dialog
    .getByLabel("Amount sent (source currency)", { exact: true })
    .fill("10");
  await dialog
    .getByLabel("Amount received (receiving currency)", { exact: true })
    .fill("1200");
  await dialog
    .getByLabel("Exchange fee (source currency)", { exact: true })
    .fill("1");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(usd().locator(".big-number")).toHaveText("USD 89.00");
  await expect(kes().locator(".big-number")).toHaveText("KES 2,200.00");
  await page.getByText("Manual / offline rate", { exact: true }).click();
  await page
    .getByLabel("Manual rate currency", { exact: true })
    .selectOption("USD");
  await page.getByLabel("Manual exchange rate", { exact: true }).fill("140");
  await page
    .getByRole("button", { name: "Save manual rate", exact: true })
    .click();
  await expect(usd()).toContainText("KES 12,460.00");
  await page
    .getByRole("button", { name: "Refresh exchange rates", exact: true })
    .click();
  await expect.poll(() => requests).toBe(2);
  await expect(usd()).toContainText("KES 12,460.00");
  await nav(page, "Reports");
  await expect(
    page.locator(".metric").filter({ hasText: "Expenses" }),
  ).toContainText("KES 129.00");
  await expect(
    page.locator(".metric").filter({ hasText: "Earned / distributed income" }),
  ).toContainText("KES 0.00");
  await nav(page, "Transactions");
  await expect(
    page.getByRole("row").filter({ hasText: "Currency exchange: USD to KES" }),
  ).toContainText("Received: KES 1,200.00");
  await expect(
    page.getByRole("row").filter({ hasText: "Currency exchange fee" }),
  ).toContainText("USD 1.00");
  await nav(page, "Backup Centre");
  await expect(page.getByText(/Currency-aware backups require/)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Download Full Backup", exact: true })
      .first()
      .click(),
  ]);
  const file = await download.path();
  await page
    .getByLabel("Full backup file", { exact: true })
    .setInputFiles(file!);
  await page
    .getByRole("button", { name: "Restore Entire Database", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await context.setOffline(true);
  await page.reload();
  await nav(page, "Accounts");
  await expect(usd().locator(".big-number")).toHaveText("USD 89.00");
  await expect(usd()).toContainText("KES 12,460.00");
  await expect(kes().locator(".big-number")).toHaveText("KES 2,200.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(false);
  await nav(page, "Income");
  await page.getByRole("button", { name: "Add income", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST USD salary");
  await page
    .getByRole("dialog")
    .getByLabel("Account", { exact: true })
    .selectOption({ label: "TEST USD bank" });
  await page
    .getByRole("dialog")
    .getByLabel("Expected net amount", { exact: true })
    .fill("20");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const salary = page.locator(".card").filter({
    has: page.getByRole("heading", { name: "TEST USD salary", exact: true }),
  });
  await expect(salary.locator(".big-number")).toHaveText("USD 20.00");
  await salary
    .getByRole("button", { name: "Add payment dates", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("First payment date", { exact: true })
    .fill("2026-11-30");
  await expect(
    page
      .getByRole("dialog")
      .getByLabel("Net expected amount per date", { exact: true }),
  ).toHaveValue("20.00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: "2026-11-30", exact: true }),
    })
    .getByRole("button", { name: "Receive", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Actual amount received", { exact: true })
    .fill("5");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Accounts");
  await expect(usd().locator(".big-number")).toHaveText("USD 94.00");
  await nav(page, "Reports");
  await expect(
    page.locator(".metric").filter({ hasText: "Earned / distributed income" }),
  ).toContainText("KES 700.00");
  await nav(page, "Settings");
  await page.getByLabel("Statement CSV", { exact: true }).setInputFiles({
    name: "usd-statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,description,debit,credit,balance\n2026-11-08,TEST USD purchase,10,,84\n",
    ),
  });
  await page
    .getByRole("combobox", {
      name: "Receiving / statement account",
      exact: true,
    })
    .selectOption({ label: "TEST USD bank" });
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    page.getByText(
      /Projected statement-account balance after selected entries/,
    ),
  ).toContainText("USD 84.00");
});
