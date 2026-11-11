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
async function stored(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("pennywise-connected-v5");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<
        { collection: string; id: string; value: Record<string, unknown> }[]
      >((resolve, reject) => {
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
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
});
test("official review populates only a draft, preserves personal inputs and persists precise terms on explicit save", async ({
  page,
}) => {
  await page.route("**/api/bond-reference", (route) =>
    route.fulfill({ status: 503, body: "Synthetic outage" }),
  );
  await page
    .getByRole("button", { name: "Set up first account", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("TEST lookup account");
  await page
    .getByRole("dialog")
    .getByLabel("Opening balance", { exact: true })
    .fill("100000");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const before = await stored(page);
  await nav(page, "Bonds");
  await page.getByRole("button", { name: "Add bond", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Principal held", { exact: true }).fill("250000");
  await dialog
    .getByLabel("Expected principal maturity value", { exact: true })
    .fill("250000");
  await dialog
    .getByLabel("Notes", { exact: true })
    .fill("TEST preserve personal notes");
  await dialog
    .getByLabel("Issue number, ISIN or recognised bond name")
    .fill("ifb1 / 2021 / 018");
  await dialog
    .getByRole("button", { name: "Find Bond Details", exact: true })
    .click();
  await dialog.getByRole("button", { name: /Review: IFB1\/2021\/018/ }).click();
  await expect(
    dialog.getByRole("button", { name: "Use These Details", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel(/I reviewed the source and differences/).check();
  await dialog
    .getByRole("button", { name: "Use These Details", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Annual coupon rate (%)", { exact: true }),
  ).toHaveValue("12.667");
  await expect(
    dialog.getByLabel("Principal held", { exact: true }),
  ).toHaveValue("250000.00");
  await expect(dialog.getByLabel("Notes", { exact: true })).toHaveValue(
    "TEST preserve personal notes",
  );
  expect(await stored(page)).toEqual(before);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await stored(page);
  const bond = saved.find((record) => record.collection === "bonds")!;
  expect(bond.value.exactCouponPercent).toBe(12.667);
  expect(bond.value.principal).toBe(25000000);
  expect(
    saved.filter((record) =>
      ["transactions", "events"].includes(record.collection),
    ),
  ).toEqual([]);
  await page.reload();
  await nav(page, "Bonds");
  await expect(
    page.getByRole("heading", {
      name: "Kenya Infrastructure Bond IFB1/2021/018",
      exact: true,
    }),
  ).toBeVisible();
  const original = await stored(page);
  await page
    .getByRole("button", { name: "Refresh / review bond details", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Refresh Bond Details", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Review:/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  expect(await stored(page)).toEqual(original);
});
test("cloud setup is optional and ordinary local backup remains available without credentials", async ({
  page,
}) => {
  const before = await stored(page);
  await nav(page, "Backup Centre");
  await expect(
    page.getByRole("heading", { name: "Account and Backup", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Google Drive backup is not available yet/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Enable Google Drive Backup",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.getByText(/VITE_GOOGLE_CLIENT_ID/)).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Full Backup", exact: true })
    .first()
    .click();
  expect((await download).suggestedFilename()).toMatch(/Pennywise-Full-Backup/);
  const after = await stored(page);
  expect(after.filter((record) => record.collection !== "audit")).toEqual(
    before.filter((record) => record.collection !== "audit"),
  );
});
test("saved Drive preference survives reload and can be disabled without Google authorization", async ({
  page,
}) => {
  const before = await stored(page);
  await page.evaluate(async () => {
    const request = indexedDB.open("pennywise-reference-and-backup", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("metadata");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("metadata", "readwrite");
        transaction.objectStore("metadata").put(
          {
            deviceId: crypto.randomUUID(),
            owner: "synthetic-owner",
            enabled: true,
            retention: 10,
          },
          "cloud-config",
        );
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
  await page.reload();
  await nav(page, "Backup Centre");
  await expect(
    page.getByText(/Google Drive backup is enabled on this device/),
  ).toBeVisible();
  const automatic = page.getByRole("checkbox", {
    name: "Automatic backups while the application is active",
  });
  await expect(automatic).toBeChecked();
  await expect(automatic).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Reconnect Google Drive", exact: true }),
  ).toBeDisabled();
  await automatic.uncheck();
  await expect(page.getByText("Google Drive backup is off.")).toBeVisible();
  await page.reload();
  await nav(page, "Backup Centre");
  await expect(automatic).not.toBeChecked();
  expect(await stored(page)).toEqual(before);
});
