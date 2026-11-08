import { test as base, expect, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";
import type { State } from "../src/domain";
import { notificationPayload } from "./notification-fixture";

interface StaticHost {
  url: string;
  deployUpdate: () => void;
  requests: { path: string; method: string }[];
}

// This isolated server exercises two static deployments, not Cloudflare's CDN.
const test = base.extend<{ staticHost: StaticHost }>({
  staticHost: async ({ baseURL }, use) => {
    const dist = join(process.cwd(), "dist");
    const originalHtml = await readFile(join(dist, "index.html"), "utf8");
    const updatedHtml = originalHtml.replace(
      "<title>Pennywise | Financial command centre</title>",
      "<title>Pennywise deployment update</title>",
    );
    const digest = (text: string) =>
      createHash("md5").update(text).digest("hex");
    const originalWorker = await readFile(join(dist, "sw.js"), "utf8");
    const updatedWorker = originalWorker.replace(
      digest(originalHtml),
      digest(updatedHtml),
    );
    if (updatedWorker === originalWorker)
      throw new Error("Unable to generate a distinct precached shell revision");
    const rules = (await readFile(join(dist, "_headers"), "utf8"))
      .trim()
      .split(/\r?\n\r?\n/)
      .map((block) => {
        const [pattern, ...lines] = block.split(/\r?\n/);
        return {
          pattern,
          headers: lines.map((line) => {
            const separator = line.indexOf(":");
            return [
              line.slice(0, separator).trim(),
              line.slice(separator + 1).trim(),
            ];
          }),
        };
      });
    const requests: StaticHost["requests"] = [];
    let updated = false;
    const server = createServer((request, response) => {
      void (async () => {
        const path = new URL(request.url!, baseURL ?? "http://localhost")
          .pathname;
        requests.push({ path, method: request.method! });
        const parts = decodeURIComponent(path).split("/").filter(Boolean);
        if (parts.includes("..")) {
          response.writeHead(403).end();
          return;
        }
        let file: Buffer;
        let extension = extname(path);
        try {
          file = await readFile(join(dist, ...parts));
        } catch {
          file = Buffer.from(updated ? updatedHtml : originalHtml);
          extension = ".html";
        }
        if (path === "/index.html")
          file = Buffer.from(updated ? updatedHtml : originalHtml);
        if (path === "/sw.js" && updated) file = Buffer.from(updatedWorker);
        const mime: Record<string, string> = {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".webmanifest": "application/manifest+json",
        };
        response.setHeader("Content-Type", mime[extension] ?? "text/plain");
        if (extension === ".html")
          response.setHeader("Cache-Control", "no-cache");
        for (const rule of rules) {
          const matches = rule.pattern.endsWith("*")
            ? path.startsWith(rule.pattern.slice(0, -1))
            : path === rule.pattern;
          if (matches)
            for (const [name, value] of rule.headers)
              response.setHeader(name, value);
        }
        response.writeHead(200).end(file);
      })().catch(() => response.writeHead(500).end());
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Static test host did not start");
    try {
      await use({
        url: `http://127.0.0.1:${address.port}`,
        deployUpdate: () => {
          updated = true;
        },
        requests,
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
});

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
test("offline POST share is intercepted locally, reviewed once and never uploaded", async ({
  page,
  staticHost,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
  await page.goto(staticHost.url);
  await firstAccount(page, "TEST share wallet");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const manifest = await page.evaluate(async () =>
    (await fetch("/manifest.webmanifest")).json(),
  );
  expect(manifest.share_target.method).toBe("POST");
  expect(manifest.share_target.action).toBe("/notification-handoff");
  await page.context().setOffline(true);
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.method = "POST";
    form.enctype = "multipart/form-data";
    form.action = "/notification-handoff";
    const input = document.createElement("input");
    input.type = "file";
    input.name = "transactions";
    input.id = "TEST-share-file";
    const button = document.createElement("button");
    button.textContent = "TEST send offline share";
    button.type = "submit";
    form.append(input, button);
    document.body.append(form);
  });
  await page.locator("#TEST-share-file").setInputFiles({
    name: "TEST-companion.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(notificationPayload())),
  });
  await page.evaluate(() => {
    (
      document.querySelector("#TEST-share-file")!
        .parentElement as HTMLFormElement
    ).requestSubmit();
  });
  await expect(
    page.getByRole("heading", { name: "Transaction Inbox", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review shared batch", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import reviewed batch", exact: true })
    .click();
  await expect(page.getByText("1 items.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Review item", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve manually", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Financial classification", exact: true })
    .selectOption("other_receipt");
  await save(page);
  expect((await snapshot(page)).transactions).toHaveLength(1);
  await page.getByLabel("Companion transaction file").setInputFiles({
    name: "TEST-retry.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(notificationPayload())),
  });
  await page
    .getByRole("button", { name: "Import reviewed batch", exact: true })
    .click();
  const state = await snapshot(page);
  expect(state.transactions).toHaveLength(1);
  expect(state.notifications.inbox[0].deliveries).toBe(2);
  expect(state.notifications.inbox[0].candidate.reference).toBe(
    "TEST-HANDOFF-001",
  );
  expect(staticHost.requests.filter((r) => r.method === "POST")).toEqual([]);
  await page.reload();
  expect((await snapshot(page)).transactions).toHaveLength(1);
});
test("source mapping, explicit approval rules and schema-3 recovery preserve the existing ledger", async ({
  page,
  staticHost,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
  await page.goto(staticHost.url);
  await firstAccount(page, "TEST mapped wallet");
  const old = await snapshot(page);
  await page.evaluate(async (state) => {
    const legacy = { ...state } as Record<string, unknown>;
    legacy.version = 3;
    delete legacy.notifications;
    const target = indexedDB.deleteDatabase("pennywise-connected-v5");
    await new Promise<void>((resolve, reject) => {
      target.onsuccess = () => resolve();
      target.onerror = () => reject(target.error);
    });
    const deleted = indexedDB.deleteDatabase("pennywise-private");
    await new Promise<void>((resolve, reject) => {
      deleted.onsuccess = () => resolve();
      deleted.onerror = () => reject(deleted.error);
    });
    const request = indexedDB.open("pennywise-private", 3);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(legacy, "current");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error("Legacy fixture write failed"));
    });
    db.close();
  }, old);
  await page.reload();
  await nav(page, "Transaction Inbox");
  await page.getByRole("button", { name: "Map source", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Display name", { exact: true })
    .fill("TEST selected app");
  await dialog
    .getByLabel("Companion source ID", { exact: true })
    .fill("synthetic.mpesa");
  await dialog
    .getByLabel("Trust this selected source for rule automation", {
      exact: true,
    })
    .check();
  await save(page);
  await page.getByRole("button", { name: "Create rule", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Rule name", { exact: true })
    .fill("TEST exact known sender");
  await dialog
    .getByLabel("Exact companion source ID", { exact: true })
    .fill("synthetic.mpesa");
  await dialog
    .getByRole("combobox", { name: "Transaction candidate type", exact: true })
    .selectOption("received");
  await dialog
    .getByRole("combobox", { name: "Direction", exact: true })
    .selectOption("credit");
  await dialog.getByLabel("Maximum amount", { exact: true }).fill("10000");
  await dialog
    .getByLabel("Exact known counterparty (optional)", { exact: true })
    .fill("TEST portable sender");
  await dialog
    .getByRole("combobox", { name: "Rule action", exact: true })
    .selectOption("approve");
  await dialog
    .getByRole("combobox", { name: "Financial classification", exact: true })
    .selectOption("earned_income");
  await dialog.getByLabel("Enable this rule", { exact: true }).check();
  await save(page);
  await page.getByLabel("Companion transaction file").setInputFiles({
    name: "TEST-rule-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(notificationPayload())),
  });
  await page
    .getByLabel(
      "This is my trusted companion file; evaluate my enabled approval rules",
      { exact: true },
    )
    .check();
  await page
    .getByRole("button", { name: "Import reviewed batch", exact: true })
    .click();
  await expect(
    page.locator(".badge").filter({ hasText: /^approved$/ }),
  ).toBeVisible();
  const result = await snapshot(page);
  expect(result.version).toBe(5);
  expect(result.accounts).toEqual(old.accounts);
  expect(result.transactions).toHaveLength(1);
  expect(result.transactions[0].type).toBe("income");
  expect(result.transactions[0].notification?.ruleVersion).toBe(1);
  expect(result.notifications.rules[0].matchCount).toBe(1);
});
async function save(page: Page, name = "Save") {
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function firstAccount(page: Page, name: string, opening = "12345.67") {
  await page.getByRole("button", { name: "Set up first account" }).click();
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByRole("dialog")
    .getByLabel("Opening balance", { exact: true })
    .fill(opening);
  await save(page);
}
async function expense(page: Page, description: string, amount = "122.34") {
  await page.getByRole("button", { name: "Quick add", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Transaction type", { exact: true })
    .selectOption("expense");
  await dialog.getByLabel("Amount", { exact: true }).fill(amount);
  await dialog.getByLabel("Description", { exact: true }).fill(description);
  await save(page);
}
async function snapshot(page: Page): Promise<State> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pennywise-connected-v5");
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
            const state: Record<string, unknown> = {
              version: meta.version,
              revision: meta.revision,
              settings: meta.settings,
            };
            const notifications: Record<string, unknown> = {};
            for (const [collection, ids] of Object.entries(meta.order) as [
              string,
              string[],
            ][]) {
              const values = ids.map((id) =>
                byId.get(JSON.stringify([collection, id])),
              );
              if (collection.startsWith("notifications."))
                notifications[collection.split(".")[1]] = values;
              else state[collection] = values;
            }
            state.notifications = notifications;
            resolve(state as State);
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

test("root assets and install manifest work on nested URLs and offline navigation", async ({
  page,
  context,
  staticHost,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${staticHost.url}/monthly/review/`);
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page).toHaveTitle("Pennywise | Financial command centre");
  await expect(page.locator(".brand")).toContainText("Pennywise");
  await expect(page.locator(".brand .logo-mark")).toHaveText("P");
  await expect(page.locator(".page-footer")).toContainText("Pennywise");
  await expect(page.locator(".page-footer")).not.toContainText("Kichella");
  const manifestResponse = await page.request.get(
    `${staticHost.url}/manifest.webmanifest`,
  );
  expect(manifestResponse.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  expect(manifestResponse.headers()["cache-control"]).toBe("no-cache");
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    name: "Pennywise Financial Command Centre",
    short_name: "Pennywise",
    start_url: "/",
    scope: "/",
    display: "standalone",
    id: "/",
  });
  const dimensions = await page.evaluate(async (icons: { src: string }[]) => {
    return Promise.all(
      icons.map(
        (icon) =>
          new Promise<number[]>((resolve, reject) => {
            const image = new Image();
            image.onload = () =>
              resolve([image.naturalWidth, image.naturalHeight]);
            image.onerror = reject;
            image.src = icon.src;
          }),
      ),
    );
  }, manifest.icons);
  expect(dimensions).toEqual([
    [192, 192],
    [512, 512],
  ]);
  const worker = await page.request.get(`${staticHost.url}/sw.js`);
  expect(worker.headers()["content-type"]).toContain("application/javascript");
  expect(worker.headers()["cache-control"]).toBe("no-cache");
  const html = await page.request.get(`${staticHost.url}/index.html`);
  expect(html.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  const scriptUrl = await page
    .locator('script[type="module"]')
    .getAttribute("src");
  expect(scriptUrl).toMatch(/^\/assets\//);
  const asset = await page.request.get(`${staticHost.url}${scriptUrl}`);
  expect(asset.ok()).toBe(true);
  expect(asset.headers()["cache-control"]).toContain("immutable");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.goto(`${staticHost.url}/another/nested/path/`);
  await expect(page.locator(".app-shell")).toBeVisible();
  await nav(page, "Budgets");
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  expect(errors).toEqual([]);
});

test("encrypted downloads restore independently, reject bad files and never upload financial data", async ({
  page,
  browser,
  isMobile,
  staticHost,
}) => {
  const outside: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith(staticHost.url)
    )
      outside.push(request.url());
  });
  await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
  await page.goto(staticHost.url);
  await firstAccount(page, "TEST source-device account");
  await expense(page, "TEST encrypted portable expense");
  const original = await snapshot(page);
  await nav(page, "Backup Centre");
  await page
    .getByLabel("Backup passphrase")
    .fill("TEST portable long passphrase");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Encrypted Backup", exact: true })
    .click();
  if (isMobile)
    await page
      .getByRole("link", { name: "Save prepared file", exact: true })
      .click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/^Pennywise-.*\.encrypted\.json$/);
  const contents = await readFile((await file.path())!, "utf8");
  expect(contents).not.toContain("TEST source-device account");
  await expense(page, "TEST source-only later expense", "50");
  const sourceAfter = await snapshot(page);
  const fresh = await browser.newContext();
  try {
    let destination = await fresh.newPage();
    await destination.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await destination.goto(staticHost.url);
    expect((await snapshot(destination)).accounts).toHaveLength(0);
    await firstAccount(destination, "TEST destination-only account", "1");
    const before = await snapshot(destination);
    await nav(destination, "Backup Centre");
    await destination
      .getByLabel("Backup passphrase")
      .fill("TEST incorrect passphrase");
    const choose = (text: string) =>
      destination.getByLabel("Full backup file").setInputFiles({
        name: "TEST-backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(text),
      });
    await choose(contents);
    await expect(destination.getByRole("alert")).toContainText(
      "Wrong passphrase",
    );
    expect(await snapshot(destination)).toEqual(before);
    const damaged = JSON.parse(contents);
    damaged.data =
      (damaged.data[0] === "A" ? "B" : "A") + damaged.data.slice(1);
    await destination
      .getByLabel("Backup passphrase")
      .fill("TEST portable long passphrase");
    await choose(JSON.stringify(damaged));
    await expect(destination.getByRole("alert")).toBeVisible();
    expect(await snapshot(destination)).toEqual(before);
    await choose('{"version":99}');
    await expect(destination.getByRole("alert")).toBeVisible();
    expect(await snapshot(destination)).toEqual(before);
    await destination
      .getByLabel("Backup passphrase")
      .fill("TEST portable long passphrase");
    await choose(contents);
    await expect(
      destination.getByRole("heading", { name: "Restore preview" }),
    ).toBeVisible();
    await destination
      .getByRole("button", { name: "Restore Entire Database", exact: true })
      .click();
    const safetyDownload = destination.waitForEvent("download");
    await save(destination, "Confirm");
    const safety = JSON.parse(
      await readFile((await (await safetyDownload).path())!, "utf8"),
    );
    expect(safety.data.accounts).toEqual(before.accounts);
    const restored = await snapshot(destination);
    for (const key of Object.keys(original) as (keyof State)[]) {
      if (key !== "audit" && key !== "revision")
        expect(restored[key]).toEqual(original[key]);
    }
    expect(await snapshot(page)).toEqual(sourceAfter);
    await destination.close();
    destination = await fresh.newPage();
    await destination.goto(staticHost.url);
    await nav(destination, "Transactions");
    await expect(
      destination.getByText("TEST encrypted portable expense", { exact: true }),
    ).toBeVisible();
    await expect(
      destination.getByText("TEST source-only later expense", { exact: true }),
    ).toHaveCount(0);
    expect(outside).toEqual([]);
    expect(
      staticHost.requests.filter((r) => !["GET", "HEAD"].includes(r.method)),
    ).toEqual([]);
  } finally {
    await fresh.close();
  }
});

test("a new service-worker deployment prompts before activation and preserves IndexedDB", async ({
  page,
  staticHost,
}) => {
  await page.clock.install({ time: new Date("2026-11-01T09:00:00Z") });
  await page.goto(staticHost.url);
  await firstAccount(page, "TEST update-surviving account");
  await expense(page, "TEST update-surviving expense");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const original = await snapshot(page);
  staticHost.deployUpdate();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
      ),
    )
    .toBe(true);
  await page.clock.fastForward("01:00:00");
  await expect(page.locator(".update-banner")).toBeVisible();
  expect(await page.title()).toBe("Pennywise | Financial command centre");
  expect(await snapshot(page)).toEqual(original);
  await page
    .getByRole("button", { name: "Reload update", exact: true })
    .click();
  await expect(page).toHaveTitle("Pennywise deployment update");
  await expect(page.locator(".app-shell")).toBeVisible();
  expect(await snapshot(page)).toEqual(original);
  await nav(page, "Transactions");
  await expect(
    page.getByText("TEST update-surviving expense", { exact: true }),
  ).toBeVisible();
});
