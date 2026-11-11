import { devices, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { test, expect } from "./google-drive-fixture";
import { inspectCloudBackup } from "../src/cloud-crypto";

const passphrase = "synthetic cloud backup passphrase";
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
async function account(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Set up first account", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel("Opening balance", { exact: true }).fill("4321");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function financialRecords(page: Page) {
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
        request.onsuccess = () =>
          resolve(
            request.result.filter(
              (r: { collection: string }) => r.collection !== "audit",
            ),
          );
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}
async function optionalStorage(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("pennywise-reference-and-backup", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string>((resolve, reject) => {
        const request = db
          .transaction("metadata")
          .objectStore("metadata")
          .getAll();
        request.onsuccess = () => resolve(JSON.stringify(request.result));
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}
async function enable(page: Page) {
  await page
    .getByRole("button", {
      name: /^(Enable Google Drive Backup|Reconnect Google Drive)$/,
    })
    .click();
  await expect(
    page.getByText("Connected: synthetic-owner@example.test", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconnect Drive", exact: true }),
  ).toBeEnabled();
}
async function unlock(page: Page) {
  await page
    .getByLabel("Drive encryption passphrase (12+ characters)", { exact: true })
    .fill(passphrase);
  await page.getByLabel("Confirm passphrase", { exact: true }).fill(passphrase);
  await page
    .getByRole("button", { name: "Unlock and Back Up", exact: true })
    .click();
}
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !testInfo.config.metadata.googleConfigured,
    "OAuth is intentionally disabled in this build",
  );
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
});

test("mock Drive backs up encrypted records and restores them in an independent browser with a safety file", async ({
  page,
  browser,
  googleDrive,
  baseURL,
  isMobile,
}) => {
  await account(page, "TEST cloud source account");
  const source = await financialRecords(page);
  await nav(page, "Backup Centre");
  expect(googleDrive.requests).toEqual([]);
  await enable(page);
  expect(await financialRecords(page)).toEqual(source);
  const recoveryDownload = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Generate and download recovery key",
      exact: true,
    })
    .click();
  if (isMobile)
    await page
      .getByRole("link", { name: "Save prepared file", exact: true })
      .click();
  const recoveryFile = await recoveryDownload;
  const recovery = (await readFile((await recoveryFile.path())!, "utf8")).split(
    "\n",
  )[1];
  await unlock(page);
  await expect(page.getByText(/^Status: verified/)).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Automatic backups while the application is active",
    })
    .uncheck();
  const uploaded = [...googleDrive.files.values()].filter(
    (file) => !file.folder,
  );
  expect(uploaded).toHaveLength(1);
  expect(uploaded[0].appProperties.verified).toBe("true");
  expect(uploaded[0].text).not.toContain("TEST cloud source account");
  expect(
    (await inspectCloudBackup(uploaded[0].text, passphrase)).state.accounts[0]
      .name,
  ).toBe("TEST cloud source account");
  expect(
    (await inspectCloudBackup(uploaded[0].text, recovery, true)).state
      .accounts[0].name,
  ).toBe("TEST cloud source account");
  const stored = await optionalStorage(page);
  for (const secret of [passphrase, recovery, "synthetic-memory-only-token"])
    expect(stored).not.toContain(secret);

  const destination = await browser.newContext({
    ...devices[isMobile ? "Pixel 7" : "Desktop Chrome"],
    baseURL,
    serviceWorkers: "block",
  });
  try {
    await googleDrive.attach(destination);
    const fresh = await destination.newPage();
    await fresh.goto("/");
    await expect(fresh.locator(".app-shell")).toBeVisible();
    await account(fresh, "TEST destination safety account");
    const before = await financialRecords(fresh);
    await nav(fresh, "Backup Centre");
    await enable(fresh);
    const previewButton = fresh.getByRole("button", {
      name: "Unlock and preview",
      exact: true,
    });
    await fresh
      .getByLabel("Drive encryption passphrase (12+ characters)", {
        exact: true,
      })
      .fill("wrong synthetic passphrase");
    await previewButton.click();
    await expect(fresh.getByRole("alert")).toContainText("Cannot unlock");
    expect(await financialRecords(fresh)).toEqual(before);
    await fresh
      .getByLabel("Drive encryption passphrase (12+ characters)", {
        exact: true,
      })
      .fill(passphrase);
    await previewButton.click();
    await expect(
      fresh.getByRole("heading", { name: "Restore preview", exact: true }),
    ).toBeVisible();
    expect(await financialRecords(fresh)).toEqual(before);
    await fresh
      .getByRole("button", {
        name: "Replace local data after safety backup",
        exact: true,
      })
      .click();
    const safety = fresh.waitForEvent("download");
    await fresh
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(fresh.getByRole("dialog")).toHaveCount(0);
    if (isMobile)
      await fresh
        .getByRole("link", { name: "Save prepared file", exact: true })
        .click();
    const safetyFile = await safety;
    const contents = JSON.parse(
      await readFile((await safetyFile.path())!, "utf8"),
    );
    expect(contents.data.accounts[0].name).toBe(
      "TEST destination safety account",
    );
    await expect.poll(() => financialRecords(fresh)).toEqual(source);
    await fresh.reload();
    await expect(fresh.locator(".app-shell")).toBeVisible();
    expect(await financialRecords(fresh)).toEqual(source);
    expect(uploaded[0].trashed).toBe(false);
  } finally {
    await destination.close();
  }
});

test("mock Drive retains pending ciphertext on provider failure and rejects corrupted read-back before retrying", async ({
  page,
  googleDrive,
}) => {
  await account(page, "TEST failure preservation account");
  const before = await financialRecords(page);
  await nav(page, "Backup Centre");
  await enable(page);
  googleDrive.uploadStatus = 503;
  await unlock(page);
  await expect(page.getByRole("alert")).toContainText("could not complete");
  expect(
    JSON.parse(await optionalStorage(page)).some(
      (value: { pending?: unknown }) => value?.pending,
    ),
  ).toBe(true);
  expect(
    [...googleDrive.files.values()].filter((file) => !file.folder),
  ).toHaveLength(0);
  await page
    .getByRole("checkbox", {
      name: "Automatic backups while the application is active",
    })
    .uncheck();
  googleDrive.uploadStatus = 200;
  await page.getByRole("button", { name: "Back Up Now", exact: true }).click();
  await expect(page.getByText(/^Status: verified/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back Up Now", exact: true }),
  ).toBeEnabled();
  const original = [...googleDrive.files.values()].find(
    (file) => !file.folder,
  )!;
  googleDrive.corruptReadback = true;
  await page.getByRole("button", { name: "Back Up Now", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("did not match");
  expect(original.trashed).toBe(false);
  const pendingFiles = [...googleDrive.files.values()].filter(
    (file) => !file.folder,
  );
  expect(pendingFiles).toHaveLength(2);
  expect(
    pendingFiles.filter((file) => file.appProperties.verified === "true"),
  ).toHaveLength(1);
  googleDrive.corruptReadback = false;
  await page.getByRole("button", { name: "Back Up Now", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Back Up Now", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText(/^Status: verified/)).toBeVisible();
  expect(
    [...googleDrive.files.values()].filter((file) => !file.folder),
  ).toHaveLength(2);
  expect(
    pendingFiles.every((file) => file.appProperties.verified === "true"),
  ).toBe(true);
  expect(await financialRecords(page)).toEqual(before);
});

test("mock Google cancellation, popup blocking, missing permission and wrong account preserve local records", async ({
  page,
  googleDrive,
}) => {
  await account(page, "TEST authorization preservation account");
  const before = await financialRecords(page);
  await nav(page, "Backup Centre");
  const enableButton = page.getByRole("button", {
    name: "Enable Google Drive Backup",
    exact: true,
  });
  for (const [failure, message] of [
    ["popup_failed_to_open", "Allow popups"],
    ["popup_closed", "cancelled"],
    ["permission", "permission was not granted"],
  ]) {
    googleDrive.popupError = failure === "permission" ? "" : failure;
    googleDrive.permission = failure !== "permission";
    await enableButton.click();
    await expect(page.getByRole("alert")).toContainText(message);
    expect(await financialRecords(page)).toEqual(before);
    expect(
      JSON.parse(await optionalStorage(page)).some(
        (value: { enabled?: boolean }) => value?.enabled,
      ),
    ).toBe(false);
  }
  googleDrive.popupError = "";
  googleDrive.permission = true;
  await enable(page);
  const filesBefore = googleDrive.requests.filter((r) =>
    r.path.startsWith("/drive/"),
  ).length;
  googleDrive.owner = "other-synthetic-owner";
  await page
    .getByRole("button", { name: "Reconnect Drive", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "bound to another Google Drive account",
  );
  expect(
    googleDrive.requests.filter((r) => r.path.startsWith("/drive/")),
  ).toHaveLength(filesBefore);
  expect(await financialRecords(page)).toEqual(before);
  expect([...googleDrive.files.values()]).toHaveLength(0);
});
