import { test, expect, type Page } from "@playwright/test";
import { fullBackup } from "../src/backup";
import { fixture, budget, recurring, liability } from "../tests/fixtures";
import { generateOccurrences } from "../src/expense-engine";
import { ingestNotifications } from "../src/notifications";

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
async function stored(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("pennywise-connected-v5");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown[]>((resolve, reject) => {
        const request = db
          .transaction("records")
          .objectStore("records")
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-15T09:00:00Z"));
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
});

test("daily overview keeps empty states, quick entry and keyboard-accessible detail without external requests", async ({
  page,
}) => {
  const external: string[] = [];
  const origin = new URL(page.url()).origin;
  page.on("request", (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith("blob:"))
      external.push(request.url());
  });
  const before = await stored(page);
  const priorities = page.getByRole("region", { name: "Daily priorities" });
  await expect(priorities).toContainText(
    "No imported transactions need your review",
  );
  await expect(priorities).toContainText("No unpaid recorded bills");
  await page
    .getByRole("button", { name: "Record expense", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  const details = page.locator(".overview-details > summary");
  await expect(
    page.getByText("Liquid cash", { exact: true }),
  ).not.toBeVisible();
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Liquid cash", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Liquid cash", { exact: true }),
  ).not.toBeVisible();
  await priorities
    .getByRole("button", { name: "Review budget", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Budgets that adapt", exact: true }),
  ).toBeVisible();
  await nav(page, "Overview");
  await page
    .getByRole("button", { name: "Review transaction inbox", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Transaction Inbox", exact: true }),
  ).toBeVisible();
  expect(await stored(page)).toEqual(before);
  expect(external).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("daily priorities reconcile restored records and remain usable offline without changing the ledger", async ({
  page,
  context,
  isMobile,
}) => {
  const s = fixture();
  budget(s);
  recurring(s, { start: "2026-11-15", firstDue: "2026-11-15" });
  generateOccurrences(s, "2026-11-30");
  liability(s).due = "2026-11-14";
  ingestNotifications(s, {
    format: "pennywise-notification-batch",
    version: 1,
    batchId: "synthetic-daily",
    createdAt: "2026-11-15T09:00:00Z",
    candidates: [
      {
        id: "daily-import",
        source: "synthetic.mpesa",
        parserId: "synthetic",
        parserVersion: "1",
        capturedAt: "2026-11-15T09:00:00Z",
        occurredAt: "2026-11-15T09:00:00Z",
        reference: "DAILY123",
        amount: 50000,
        currency: "KES",
        direction: "credit",
        kind: "received",
        counterparty: "TEST sender",
        fee: 0,
        confidence: 99,
        missing: [],
        validation: "valid",
        fingerprint: "a".repeat(64),
      },
    ],
  });
  await nav(page, "Backup Centre");
  await page.getByLabel("Full backup file", { exact: true }).setInputFiles({
    name: "synthetic-daily.json",
    mimeType: "application/json",
    buffer: Buffer.from(await fullBackup(s)),
  });
  await expect(
    page.getByRole("heading", { name: "Restore preview", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore Entire Database", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  if (isMobile)
    await page
      .getByRole("link", { name: "Save prepared file", exact: true })
      .click();
  await nav(page, "Overview");
  const before = await stored(page);
  const priorities = page.getByRole("region", { name: "Daily priorities" });
  await expect(page.locator(".hero-amount")).toHaveText("KES 80,000.00");
  await expect(
    priorities.getByText("KES 13,000.00", { exact: true }),
  ).toBeVisible();
  await expect(priorities).toContainText("Overdue 2026-11-14");
  await expect(priorities).toContainText("Due today 2026-11-15");
  await expect(priorities.getByText("1", { exact: true })).toBeVisible();
  await priorities
    .getByRole("button", { name: "Review TEST Wi-Fi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recurring expenses", exact: true }),
  ).toBeVisible();
  await nav(page, "Overview");
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
    page.getByRole("region", { name: "Daily priorities" }),
  ).toContainText("TEST Wi-Fi");
  await expect(page.locator(".hero-amount")).toHaveText("KES 80,000.00");
  expect(await stored(page)).toEqual(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Record income", exact: true })
    .click();
  const income = page.getByRole("dialog");
  await income.getByLabel("Amount", { exact: true }).fill("100");
  await income
    .getByLabel("Description", { exact: true })
    .fill("TEST daily income");
  await income.getByRole("button", { name: "Save", exact: true }).click();
  await expect(income).toHaveCount(0);
  await expect(page.locator(".hero-amount")).toHaveText("KES 80,100.00");
  await page.reload();
  await expect(page.locator(".hero-amount")).toHaveText("KES 80,100.00");
});
