import {
  test,
  expect,
  devices,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import type { SyncHead } from "../src/sync-protocol";

const passphrase = "synthetic cross-device passphrase";
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
const panel = (page: Page) =>
  page.getByRole("region", { name: "Cross-device sync", exact: true });
async function addAccount(page: Page, name: string) {
  await nav(page, "Accounts");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel("Opening balance", { exact: true }).fill("1234");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
function cloud() {
  let head: SyncHead | null = null;
  const snapshots = new Map<string, string>();
  const owners = new Map<BrowserContext, string>();
  let calls = 0;
  return {
    snapshots,
    owners,
    get calls() {
      return calls;
    },
    get head() {
      return head;
    },
    async attach(context: BrowserContext) {
      owners.set(context, "synthetic-owner");
      await context.route(/^https:\/\//, (route) =>
        route.abort("blockedbyclient"),
      );
      await context.exposeBinding(
        "pennywiseSyntheticSync",
        (_source, method: string, expected?: string | null, text?: string) => {
          calls++;
          if (method === "connect")
            return { owner: owners.get(context), project: "demo-pennywise" };
          if (method === "head") return head;
          if (method === "read") return snapshots.get(expected!);
          if (method === "commit") {
            if ((head?.id ?? null) !== expected)
              return {
                error:
                  "Another device changed the cloud workspace. Review both versions.",
              };
            const next: SyncHead = {
              protocol: 1,
              id: randomUUID(),
              chunks: Math.ceil(text!.length / 200000),
              digest: createHash("sha256").update(text!).digest("hex"),
              previous: head ? { id: head.id, chunks: head.chunks } : null,
            };
            snapshots.set(next.id, text!);
            head = next;
            return head;
          }
          return null;
        },
      );
      // Replace only the optional provider boundary, not the encryption, sync engine, UI or storage.
      await context.route(
        /\/assets\/firebase-sync-[^/]+\.js$/,
        async (route) => {
          const source = await (await route.fetch()).text();
          expect(source).toMatch(/as connectFirebaseSync/);
          await route.fulfill({
            contentType: "application/javascript",
            body: `
          export async function connectFirebaseSync() {
            const call = async (...args) => { const result = await globalThis.pennywiseSyntheticSync(...args); if (result?.error) throw new Error(result.error); return result; };
            const identity = await call('connect');
            return { ...identity, head: () => call('head'), read: (head) => call('read', head.id), commit: (expected, text) => call('commit', expected, text), watch: () => () => {}, close: async () => {} };
          }
        `,
          });
        },
      );
    },
  };
}
async function connect(page: Page, secret = passphrase) {
  await nav(page, "Backup Centre");
  await panel(page)
    .getByRole("button", { name: "Connect Google for Sync", exact: true })
    .click();
  await expect(panel(page).getByText(/Sync: locked/)).toBeVisible();
  await panel(page)
    .getByLabel("Sync workspace passphrase (12+ characters)", { exact: true })
    .fill(secret);
  await panel(page)
    .getByLabel("Confirm sync passphrase", { exact: true })
    .fill(secret);
  await panel(page)
    .getByRole("button", { name: "Unlock Sync Workspace", exact: true })
    .click();
}
async function safety(page: Page, remote: boolean, mobile: boolean) {
  for (const name of [
    "Export This Device Safety Copy",
    ...(remote ? ["Export Cloud Safety Copy"] : []),
  ]) {
    const saved = page.waitForEvent("download");
    await panel(page).getByRole("button", { name, exact: true }).click();
    if (mobile)
      await page
        .getByRole("link", { name: "Save prepared file", exact: true })
        .click();
    expect((await saved).suggestedFilename()).toContain(".encrypted.json");
  }
  await panel(page).getByRole("checkbox").check();
}

test("unconfigured sync is optional, makes no cloud calls and preserves manual workflows", async ({
  page,
}, info) => {
  test.skip(
    Boolean(info.config.metadata.syncConfigured),
    "Checks the build with optional sync disabled",
  );
  const providerRequests: string[] = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (
      host.endsWith(".firebaseapp.com") ||
      [
        "identitytoolkit.googleapis.com",
        "securetoken.googleapis.com",
        "firestore.googleapis.com",
        "apis.google.com",
      ].includes(host)
    )
      providerRequests.push(host);
  });
  await page.goto("/");
  await nav(page, "Backup Centre");
  await expect(panel(page)).toContainText("not configured in this build");
  await expect(
    panel(page).getByRole("button", {
      name: "Connect Google for Sync",
      exact: true,
    }),
  ).toBeDisabled();
  await addAccount(page, "TEST local-only account");
  await expect(
    page.getByRole("heading", { name: "TEST local-only account", exact: true }),
  ).toBeVisible();
  expect(providerRequests).toEqual([]);
});

test("independent devices explicitly link encrypted workspaces, automatically propagate edits and resolve offline conflicts", async ({
  page,
  context,
  browser,
  baseURL,
  isMobile,
}, info) => {
  test.skip(
    !info.config.metadata.syncConfigured,
    "Requires synthetic sync configuration",
  );
  const remote = cloud();
  await remote.attach(context);
  const second = await browser.newContext({
    ...(isMobile ? devices["Pixel 7"] : devices["Desktop Chrome"]),
    baseURL,
    serviceWorkers: "block",
  });
  try {
    await remote.attach(second);
    const other = await second.newPage();
    await page.goto("/");
    await addAccount(page, "TEST first device");
    await nav(page, "Backup Centre");
    expect(remote.calls).toBe(0);
    await connect(page);
    expect(remote.head).toBeNull();
    await expect(
      panel(page).getByRole("button", {
        name: "Start Sync With This Device",
        exact: true,
      }),
    ).toBeDisabled();
    await safety(page, false, isMobile);
    await panel(page)
      .getByRole("button", { name: "Start Sync With This Device", exact: true })
      .click();
    await expect(panel(page).getByText(/Sync: synced/)).toBeVisible();
    expect([...remote.snapshots.values()].join("")).not.toContain(
      "TEST first device",
    );
    await other.goto("/");
    await addAccount(other, "TEST second local version");
    await connect(other);
    await expect(panel(other)).toContainText("On this device: 1 accounts");
    await safety(other, true, isMobile);
    await panel(other)
      .getByRole("button", {
        name: "Use Cloud Workspace on This Device",
        exact: true,
      })
      .click();
    await expect(panel(other).getByText(/Sync: synced/)).toBeVisible();
    await nav(other, "Accounts");
    await expect(
      other.getByRole("heading", { name: "TEST first device", exact: true }),
    ).toBeVisible();
    await expect(
      other.getByRole("heading", {
        name: "TEST second local version",
        exact: true,
      }),
    ).toHaveCount(0);
    const previous = remote.head!.id;
    await addAccount(page, "TEST automatic propagation");
    await expect
      .poll(() => remote.head!.id, { timeout: 25000 })
      .not.toBe(previous);
    await other.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(
      other.getByRole("heading", {
        name: "TEST automatic propagation",
        exact: true,
      }),
    ).toBeVisible();
    await context.setOffline(true);
    await second.setOffline(true);
    await addAccount(page, "TEST offline first");
    await addAccount(other, "TEST offline second");
    await nav(page, "Backup Centre");
    await nav(other, "Backup Centre");
    const beforeConflict = remote.head!.id;
    await context.setOffline(false);
    await expect
      .poll(() => remote.head!.id, { timeout: 25000 })
      .not.toBe(beforeConflict);
    await second.setOffline(false);
    await expect(panel(other).getByText(/Sync: conflict/)).toBeVisible();
    await panel(other)
      .getByRole("button", { name: "Review Sync Versions", exact: true })
      .click();
    await safety(other, true, isMobile);
    await panel(other)
      .getByRole("button", {
        name: "Use Cloud Workspace on This Device",
        exact: true,
      })
      .click();
    await expect(panel(other).getByText(/Sync: synced/)).toBeVisible();
    await nav(other, "Accounts");
    await expect(
      other.getByRole("heading", { name: "TEST offline first", exact: true }),
    ).toBeVisible();
    await expect(
      other.getByRole("heading", { name: "TEST offline second", exact: true }),
    ).toHaveCount(0);
    expect(
      await other.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await second.close();
  }
});

test("reload locks encryption and a different Google UID cannot inherit the local workspace", async ({
  page,
  context,
  isMobile,
}, info) => {
  test.skip(
    !info.config.metadata.syncConfigured,
    "Requires synthetic sync configuration",
  );
  const remote = cloud();
  await remote.attach(context);
  await page.goto("/");
  await addAccount(page, "TEST retained after reload");
  await connect(page);
  await safety(page, false, isMobile);
  await panel(page)
    .getByRole("button", { name: "Start Sync With This Device", exact: true })
    .click();
  await expect(panel(page).getByText(/Sync: synced/)).toBeVisible();
  await page.reload();
  await nav(page, "Backup Centre");
  await expect(panel(page).getByText(/Sync: off/)).toBeVisible();
  await connect(page, "incorrect synthetic passphrase");
  await expect(panel(page).getByRole("alert")).toContainText("Cannot unlock");
  await panel(page)
    .getByRole("button", { name: "Pause and Disconnect Sync", exact: true })
    .click();
  remote.owners.set(context, "synthetic-other-owner");
  await panel(page)
    .getByRole("button", { name: "Connect Google for Sync", exact: true })
    .click();
  await expect(panel(page).getByRole("alert")).toContainText(
    "different Google account",
  );
  await nav(page, "Accounts");
  await expect(
    page.getByRole("heading", {
      name: "TEST retained after reload",
      exact: true,
    }),
  ).toBeVisible();
});
