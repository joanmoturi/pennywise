import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
async function ledger(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pennywise-connected-v5");
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
async function addAccount(page: Page) {
  await nav(page, "Accounts");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Name", { exact: true })
    .fill("TEST private-support-account@example.test");
  await dialog.getByLabel("Opening balance", { exact: true }).fill("987654.32");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("privacy guidance and technical report work offline without exporting records or contacting providers", async ({
  page,
  context,
}, info) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["https:", "http:"].includes(url.protocol) &&
      url.origin !== new URL(String(info.project.use.baseURL)).origin
    )
      external.push(url.hostname);
  });
  await page.goto("/");
  await addAccount(page);
  const before = await ledger(page);
  await nav(page, "Settings");
  const support = page.getByRole("region", {
    name: "Privacy and support",
    exact: true,
  });
  await expect(support).toContainText("separate, optional services");
  await expect(
    page.getByText("No bank credentials, analytics, cloud sync", {
      exact: false,
    }),
  ).toHaveCount(0);
  await support
    .getByText("Recovery, sign-out and deletion", { exact: true })
    .click();
  await expect(support).toContainText(
    "Customer-controlled cloud sync deletion is not available yet",
  );
  await expect(support).toContainText("cannot reset your sync passphrase");
  await support
    .getByText("Connection and saving help", { exact: true })
    .click();
  await expect(support).toContainText(
    "Do not reset, clear site data or uninstall to troubleshoot",
  );
  await expect(
    support.getByRole("button", {
      name: "Download technical report",
      exact: true,
    }),
  ).toHaveCount(0);
  await context.setOffline(true);
  await support
    .getByRole("button", { name: "Prepare technical report", exact: true })
    .click();
  const preview = support.locator("pre");
  await expect(preview).toContainText("pennywise-technical-support");
  const report = JSON.parse((await preview.textContent())!);
  expect(report.browser.online).toBe(false);
  expect(report.application.asset).toMatch(/^\/assets\/index-[\w-]+\.js$/);
  expect(JSON.stringify(report)).not.toContain("private-support-account");
  expect(JSON.stringify(report)).not.toContain("987654");
  expect(report).not.toHaveProperty("data");
  const pending = page.waitForEvent("download");
  await support
    .getByRole("button", { name: "Download technical report", exact: true })
    .click();
  if (info.project.name === "mobile")
    await page
      .getByRole("link", { name: "Save prepared file", exact: true })
      .click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toBe(
    "Pennywise-technical-support.json",
  );
  expect(
    JSON.parse(await readFile((await downloaded.path())!, "utf8")),
  ).toEqual(report);
  expect(await ledger(page)).toEqual(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  await support
    .getByRole("button", { name: "Open Backup Centre", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Backup Centre", exact: true }),
  ).toBeVisible();
  expect(external).toEqual([]);
  await context.setOffline(false);
});

test("sync sign-in explains blocked popup, configuration and access errors without changing local records", async ({
  page,
  context,
}, info) => {
  test.skip(
    !info.config.metadata.syncConfigured,
    "Requires the isolated synthetic sync build",
  );
  await context.route(/\/assets\/firebase-sync-[^/]+\.js$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    let attempts = 0;
    export async function connectFirebaseSync() {
      attempts++;
      if (attempts <= 2) throw Object.assign(new Error('TEST-private-provider-context'), {code: attempts === 1 ? 'auth/popup-blocked' : 'auth/unauthorized-domain'});
      return {owner: 'synthetic-owner', project: 'demo-pennywise', head: async () => { throw Object.assign(new Error('TEST-private-provider-context'), {code:'permission-denied'}); }, close: async () => {}, watch: () => () => {}};
    }
  `,
    }),
  );
  await page.goto("/");
  await addAccount(page);
  const before = await ledger(page);
  await nav(page, "Backup Centre");
  const sync = page.getByRole("region", {
    name: "Cross-device sync",
    exact: true,
  });
  await sync
    .getByRole("button", { name: "Connect Google for Sync", exact: true })
    .click();
  await expect(sync.getByRole("alert")).toContainText("Allow popups");
  await expect(sync).not.toContainText("TEST-private-provider-context");
  await sync
    .getByRole("button", { name: "Connect Google for Sync", exact: true })
    .click();
  await expect(sync.getByRole("alert")).toContainText(
    "app owner needs to check",
  );
  await sync
    .getByRole("button", { name: "Connect Google for Sync", exact: true })
    .click();
  await sync
    .getByLabel("Sync workspace passphrase (12+ characters)", { exact: true })
    .fill("TEST private support passphrase");
  await sync
    .getByLabel("Confirm sync passphrase", { exact: true })
    .fill("TEST private support passphrase");
  await sync
    .getByRole("button", { name: "Unlock Sync Workspace", exact: true })
    .click();
  await expect(sync.getByRole("alert")).toContainText(
    "do not weaken security rules",
  );
  await expect(sync).not.toContainText("TEST-private-provider-context");
  expect(await ledger(page)).toEqual(before);
});
