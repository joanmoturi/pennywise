import { test, expect, type Page, type Locator } from "@playwright/test";

async function navigation(page: Page) {
  await expect(page.locator(".app-shell")).toBeVisible();
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  return page.getByRole("navigation", { name: "Main navigation", exact: true });
}
async function nav(page: Page, name: string) {
  await (
    await navigation(page)
  )
    .getByRole("button", { name, exact: true })
    .click();
}
async function withinViewport(page: Page, popup: Locator) {
  const box = await popup.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(15);
  expect(box!.y).toBeGreaterThanOrEqual(15);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width - 15);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - 15);
}
async function storedData(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pennywise-connected-v5");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string>((resolve, reject) => {
        const tx = db.transaction(["state", "records"]);
        const header = tx.objectStore("state").getAll();
        const records = tx.objectStore("records").getAll();
        tx.oncomplete = () =>
          resolve(JSON.stringify([header.result, records.result]));
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}

test("info supports hover, pinned click or tap, dismissal and unchanged financial data", async ({
  page,
  isMobile,
}) => {
  await page.goto("/?example=1");
  await expect(page.locator(".hero-amount")).toBeVisible();
  const before = await storedData(page);
  const trigger = page.getByRole("button", {
    name: "Available after commitments information",
    exact: true,
  });
  const popup = page.getByRole("region", {
    name: "About Available after commitments",
    exact: true,
  });
  await expect(popup).toHaveCount(0);
  if (!isMobile) {
    await trigger.hover();
    await expect(popup).toContainText("Expected payments are not included.");
    await popup.hover();
    await expect(popup).toBeVisible();
    await page.mouse.move(5, 5);
    await expect(popup).toHaveCount(0);
  }
  if (isMobile) await trigger.tap();
  else await trigger.click();
  await expect(popup).toBeVisible();
  await withinViewport(page, popup);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  if (!isMobile) {
    await page.mouse.move(5, 5);
    await expect(popup).toBeVisible();
  }
  await popup
    .getByRole("button", {
      name: "Close Available after commitments information",
    })
    .click();
  await expect(popup).toHaveCount(0);
  await trigger.click();
  await expect(popup).toBeVisible();
  await page.locator(".hero-amount").click();
  await expect(popup).toHaveCount(0);
  expect(await storedData(page)).toBe(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("keyboard field help is usable inside modal dialogs without saving or closing the form", async ({
  page,
}) => {
  await page.goto("/?example=1");
  await nav(page, "Accounts");
  const before = await storedData(page);
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByLabel("Opening balance", { exact: true });
  await input.fill("678.90");
  const trigger = dialog.getByRole("button", {
    name: "Opening balance information",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Space");
  const popup = page.getByRole("region", {
    name: "About Opening balance",
    exact: true,
  });
  await expect(popup).toContainText("Existing balance, not income.");
  await withinViewport(page, popup);
  expect(
    await popup.evaluate((element) => element.closest("dialog") !== null),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue("678.90");
  await trigger.click();
  await expect(popup).toBeVisible();
  const outsideInput = dialog.getByRole("textbox", {
    name: "Name",
    exact: true,
  });
  await outsideInput.click();
  await expect(popup).toHaveCount(0);
  await expect(outsideInput).toBeFocused();
  await expect(input).toHaveValue("678.90");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await storedData(page)).toBe(before);
});

test("backup, privacy and destructive warnings remain visible without opening info", async ({
  page,
}) => {
  await page.goto("/?example=1");
  await nav(page, "Backup Centre");
  await expect(
    page.getByText("Schema-5 backups require this version or newer.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Export a full backup before switching versions\. Each version keeps a separate history\./,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/Unencrypted JSON contains sensitive financial records/),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Losing the password may make an encrypted backup unrecoverable/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/Last full backup export initiated/),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "About Backup encryption & integrity" }),
  ).toHaveCount(0);
  await nav(page, "Settings");
  await expect(
    page.getByText(/Local data is not application-encrypted at rest/),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Clearing site data removes offline cache and financial records/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^(Remove demo data|Reset data)$/ })
    .click();
  await expect(
    page.getByRole("dialog").locator(".dialog-description"),
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel(/Type RESET/)).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
});

test("every page exposes contextual info without mobile overflow or stale popovers", async ({
  page,
}) => {
  await page.goto("/?example=1");
  const names = await (
    await navigation(page)
  )
    .getByRole("button")
    .allTextContents();
  expect(names.length).toBeGreaterThanOrEqual(20);
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  for (const name of names) {
    await nav(page, name);
    const triggers = await page.locator(".page-head .info-button").all();
    expect(triggers.length, name).toBeGreaterThanOrEqual(1);
    for (const trigger of triggers) {
      await trigger.click();
      const popup = page.locator(".info-popover");
      await expect(popup).toHaveCount(1);
      await expect(popup.locator(".info-content")).not.toBeEmpty();
      await withinViewport(page, popup);
      await popup.getByRole("button").click();
      await expect(popup).toHaveCount(0);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name,
    ).toBe(true);
  }
});
