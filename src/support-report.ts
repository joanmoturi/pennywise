import { inspectAuxiliary } from "./auxiliary-storage";
import { APP_VERSION } from "./backup";
import { SYNC_CONFIGURED } from "./sync-config";
import { GOOGLE_CLIENT_ID } from "./google-services";

const queueStatuses = [
  "pending",
  "uploading",
  "uploaded",
  "verified",
  "failed",
  "retry scheduled",
  "authorization required",
  "encryption required",
] as const;
interface SupportEnvironment {
  generatedAt: string;
  appVersion: string;
  applicationAsset: string | null;
  online: boolean;
  secureContext: boolean;
  standalone: boolean;
  indexedDB: boolean;
  webCrypto: boolean;
  webLocks: boolean;
  serviceWorker: boolean;
  serviceWorkerControlled: boolean;
  persistentStorage: "granted" | "not granted" | "unavailable";
  driveConfigured: boolean;
  syncConfigured: boolean;
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function buildSupportReport(
  environment: SupportEnvironment,
  metadata: Record<string, unknown> | undefined,
) {
  const config = record(metadata?.["cloud-config"]);
  const queue = record(metadata?.["cloud-queue"]);
  const binding = record(metadata?.["workspace-sync"]);
  const status =
    queueStatuses.find((status) => status === queue.status) ?? "unknown";
  return {
    format: "pennywise-technical-support",
    reportVersion: 1,
    generatedAt: environment.generatedAt,
    application: {
      version: environment.appVersion,
      asset:
        environment.applicationAsset &&
        /^\/assets\/index-[\w-]+\.js$/.test(environment.applicationAsset)
          ? environment.applicationAsset
          : null,
    },
    browser: {
      online: environment.online,
      secureContext: environment.secureContext,
      standalone: environment.standalone,
      indexedDB: environment.indexedDB,
      webCrypto: environment.webCrypto,
      webLocks: environment.webLocks,
      serviceWorker: environment.serviceWorker,
      serviceWorkerControlled: environment.serviceWorkerControlled,
      persistentStorage: environment.persistentStorage,
    },
    optionalFeatures: {
      statusRead: metadata === undefined ? "unavailable" : "available",
      drive: {
        configured: environment.driveConfigured,
        automaticEnabled: flag(config.enabled),
        queueStatus: status,
        pendingSnapshot:
          status === "unknown" ? null : queue.pending !== undefined,
      },
      sync: {
        configured: environment.syncConfigured,
        enabled: flag(binding.enabled),
        linked: flag(binding.linked),
      },
    },
    limitations: [
      "This technical report is not a financial backup or proof of successful cloud backup, Google sign-in or two-device sync.",
      "No financial records, balances, record counts, names, email addresses, account/device IDs, passphrases, tokens, file contents, URLs, raw errors or logs are included.",
      "Created locally on request. Pennywise does not automatically upload this report.",
    ],
  };
}
export type SupportReport = ReturnType<typeof buildSupportReport>;

export async function collectSupportReport(): Promise<SupportReport> {
  const [metadata, persisted] = await Promise.allSettled([
    Promise.resolve().then(() =>
      inspectAuxiliary(["cloud-config", "cloud-queue", "workspace-sync"]),
    ),
    Promise.resolve().then(() => navigator.storage?.persisted?.()),
  ]);
  const script = Array.from(document.scripts).find((script) => {
    const url = new URL(script.src, location.href);
    return (
      url.origin === location.origin &&
      /^\/assets\/index-[\w-]+\.js$/.test(url.pathname)
    );
  });
  return buildSupportReport(
    {
      generatedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      applicationAsset: script ? new URL(script.src).pathname : null,
      online: navigator.onLine,
      secureContext: window.isSecureContext === true,
      standalone:
        window.matchMedia?.("(display-mode: standalone)").matches === true ||
        ("standalone" in navigator && navigator.standalone === true),
      indexedDB: typeof indexedDB !== "undefined",
      webCrypto: typeof crypto !== "undefined" && Boolean(crypto.subtle),
      webLocks: Boolean(navigator.locks),
      serviceWorker: "serviceWorker" in navigator,
      serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
      persistentStorage:
        persisted.status !== "fulfilled" || typeof persisted.value !== "boolean"
          ? "unavailable"
          : persisted.value
            ? "granted"
            : "not granted",
      driveConfigured: Boolean(GOOGLE_CLIENT_ID),
      syncConfigured: SYNC_CONFIGURED,
    },
    metadata.status === "fulfilled" ? metadata.value : undefined,
  );
}
