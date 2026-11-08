import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import type { Income } from "../src/domain";

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
async function records(
  page: Page,
): Promise<{ collection: string; value: unknown }[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pennywise-connected-v5");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("records");
        const request = tx.objectStore("records").getAll();
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
async function finalBalances(page: Page) {
  const values = await page
    .locator(".card")
    .filter({
      has: page.getByRole("heading", {
        name: "Exact projected balances",
        exact: true,
      }),
    })
    .locator("tbody tr")
    .last()
    .getByRole("cell")
    .allTextContents();
  return values.map((value) =>
    value.replace(/^(Conservative|Expected|Optimistic)/, ""),
  );
}
test("MMF CSV, currency consent, payout-only forecasts, receipt history and disabled restore work together", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-08T09:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Set up first account", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST MMF receiving account");
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
  await nav(page, "Income");
  await page
    .getByRole("button", { name: "Import MMF Studio CSV", exact: true })
    .click();
  await page
    .getByLabel("MMF Studio monthly CSV", { exact: true })
    .setInputFiles(resolve("tests", "fixtures", "mmf-studio.csv"));
  await page
    .getByLabel("MMF receiving account", { exact: true })
    .selectOption({ label: "TEST MMF receiving account" });
  await expect(
    page.getByRole("button", { name: "Confirm MMF import", exact: true }),
  ).toBeDisabled();
  expect(
    (await records(page)).filter((record) => record.collection === "incomes"),
  ).toHaveLength(0);
  await page
    .getByRole("checkbox", {
      name: "I confirm these MMF amounts are in KES",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Confirm MMF import", exact: true })
    .click();
  await expect(
    page.getByText("Projected MMF income disabled", { exact: true }),
  ).toBeVisible();
  expect(
    (await records(page)).filter((record) => record.collection === "accounts"),
  ).toHaveLength(1);
  expect(
    (await records(page)).filter(
      (record) => record.collection === "transactions",
    ),
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Enable MMF income", exact: true })
    .click();
  await expect(
    page.getByText("Projected MMF income enabled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Projected reinvested interest", { exact: true }),
  ).toBeVisible();
  await nav(page, "Forecast");
  await page.getByLabel("Forecast horizon", { exact: true }).selectOption("30");
  expect((await finalBalances(page)).slice(1)).toEqual([
    "KES 1,000.00",
    "KES 1,025.19",
    "KES 1,025.19",
  ]);
  await page
    .getByRole("button", { name: "Disable MMF income", exact: true })
    .click();
  expect((await finalBalances(page)).slice(1)).toEqual([
    "KES 1,000.00",
    "KES 1,000.00",
    "KES 1,000.00",
  ]);
  await nav(page, "Income");
  await expect(
    page.getByRole("cell", { name: "MMF Studio interest", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Enable MMF income", exact: true })
    .click();
  const payout = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "2026-11-30", exact: true }),
  });
  await payout.getByRole("button", { name: "Receive", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Actual amount received", { exact: true })
    .fill("10");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Actual MMF receipts: KES 10.00", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Disable MMF income", exact: true })
    .click();
  await expect(
    page.getByText("Actual MMF receipts: KES 10.00", { exact: true }),
  ).toBeVisible();
  await nav(page, "Backup Centre");
  await expect(
    page.getByText(/Backups containing MMF projections require an MMF-enabled/),
  ).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Download Full Backup", exact: true })
      .first()
      .click(),
  ]);
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();
  await page
    .getByLabel("Full backup file", { exact: true })
    .setInputFiles(backupPath!);
  await page
    .getByRole("button", { name: "Restore Entire Database", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Income");
  await expect(
    page.getByText("Projected MMF income disabled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Actual MMF receipts: KES 10.00", { exact: true }),
  ).toBeVisible();
  const income = (await records(page)).find(
    (record) => record.collection === "incomes",
  )!.value as Income;
  expect(income.active).toBe(false);
  expect(income.mmfStudio?.rows).toHaveLength(7);
  expect(
    (await records(page)).filter(
      (record) => record.collection === "transactions",
    ),
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
