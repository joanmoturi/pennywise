import { afterEach, describe, expect, it, vi } from "vitest";
import { auxiliaryUpdate, inspectAuxiliary } from "../src/auxiliary-storage";
import {
  buildSupportReport,
  collectSupportReport,
} from "../src/support-report";

const environment = {
  generatedAt: "2026-11-23T12:00:00Z",
  appVersion: "1.3.0",
  applicationAsset: "/assets/index-TEST.js",
  online: false,
  secureContext: true,
  standalone: true,
  indexedDB: true,
  webCrypto: true,
  webLocks: false,
  serviceWorker: true,
  serviceWorkerControlled: true,
  persistentStorage: "not granted" as const,
  driveConfigured: true,
  syncConfigured: true,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("redacted local technical support reports", () => {
  it("allowlists technical flags while excluding identities, ciphertext, free text and extra fields", () => {
    const secret = "TEST-never-share-this-identity-or-financial-content";
    const metadata = {
      "cloud-config": {
        enabled: true,
        owner: secret,
        deviceId: secret,
        email: secret,
      },
      "cloud-queue": {
        status: "failed",
        message: secret,
        lastFile: secret,
        lastSuccess: secret,
        pending: { text: secret, owner: secret },
        attempts: 99,
      },
      "workspace-sync": {
        enabled: true,
        linked: false,
        owner: secret,
        project: secret,
        baseDigest: secret,
        deviceId: secret,
      },
      unknown: { token: secret, financialRecords: secret },
    };
    const before = structuredClone(metadata);
    const report = buildSupportReport(
      {
        ...environment,
        applicationAsset: `/assets/index-TEST.js?token=${secret}`,
        ...{ rawError: secret, userAgent: secret },
      },
      metadata,
    );
    expect(report.application.asset).toBeNull();
    expect(report.optionalFeatures).toEqual({
      statusRead: "available",
      drive: {
        configured: true,
        automaticEnabled: true,
        queueStatus: "failed",
        pendingSnapshot: true,
      },
      sync: { configured: true, enabled: true, linked: false },
    });
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(metadata).toEqual(before);
    expect(
      buildSupportReport(environment, {
        "cloud-queue": { status: secret },
        "cloud-config": { enabled: secret },
      }).optionalFeatures.drive,
    ).toMatchObject({ automaticEnabled: null, queueStatus: "unknown" });
  });
  it("collects offline without provider calls, financial-database reads or metadata writes", async () => {
    await auxiliaryUpdate("cloud-config", () => ({
      enabled: true,
      owner: "TEST-private-owner",
    }));
    await auxiliaryUpdate("cloud-queue", () => ({
      status: "verified",
      pending: undefined,
      text: "TEST-private-ciphertext",
    }));
    await auxiliaryUpdate("workspace-sync", () => ({
      enabled: false,
      linked: true,
      owner: "TEST-private-owner",
    }));
    const before = await inspectAuxiliary([
      "cloud-config",
      "cloud-queue",
      "workspace-sync",
    ]);
    const open = vi.spyOn(indexedDB, "open");
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    const fetch = vi.fn(() =>
      Promise.reject(new Error("No network permitted")),
    );
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const report = await collectSupportReport();
    expect(report.browser.online).toBe(false);
    expect(report.optionalFeatures.drive.queueStatus).toBe("verified");
    expect(report.optionalFeatures.sync.linked).toBe(true);
    expect(
      open.mock.calls.every(
        ([name]) => name === "pennywise-reference-and-backup",
      ),
    ).toBe(true);
    expect(put).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain("TEST-private");
    expect(
      await inspectAuxiliary(["cloud-config", "cloud-queue", "workspace-sync"]),
    ).toEqual(before);
  });
  it("marks denied status reads unavailable without leaking their raw errors or assuming a healthy backup", async () => {
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new Error("TEST-private-failure-context");
    });
    const report = await collectSupportReport();
    expect(report.optionalFeatures.statusRead).toBe("unavailable");
    expect(report.optionalFeatures.drive.automaticEnabled).toBeNull();
    expect(report.optionalFeatures.drive.pendingSnapshot).toBeNull();
    expect(report.optionalFeatures.drive.queueStatus).toBe("unknown");
    expect(report.optionalFeatures.sync.linked).toBeNull();
    expect(JSON.stringify(report)).not.toContain("TEST-private");
  });
  it("does not create optional storage just to inspect a fresh installation", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(
        "pennywise-reference-and-backup",
      );
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    const namesBefore = await indexedDB.databases();
    expect(await inspectAuxiliary(["cloud-config"])).toEqual({});
    expect(await indexedDB.databases()).toEqual(namesBefore);
  });
});
