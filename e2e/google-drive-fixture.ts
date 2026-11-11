import { test as base, expect, type BrowserContext } from "@playwright/test";
import type { DriveFile } from "../src/google-services";

interface StoredFile extends DriveFile {
  text: string;
  folder: boolean;
  trashed: boolean;
}
interface DriveRequest {
  method: string;
  path: string;
  body: string;
}
export interface SyntheticDrive {
  files: Map<string, StoredFile>;
  requests: DriveRequest[];
  owner: string;
  permission: boolean;
  popupError: string;
  uploadStatus: number;
  corruptReadback: boolean;
  attach: (context: BrowserContext) => Promise<void>;
}
const sdk = `
globalThis.google = { accounts: {
  id: {
    initialize() {},
    renderButton(element) { element.textContent = "Synthetic Google sign-in"; },
    disableAutoSelect() {},
    revoke(_hint, callback) { callback(); }
  },
  oauth2: {
    initTokenClient(options) {
      return { requestAccessToken() {
        globalThis.pennywiseTestConsent().then(result => {
          if (result.popupError)
            options.error_callback({ type: result.popupError });
          else options.callback(result.response);
        });
      } };
    },
    revoke(_token, callback) { callback(); }
  }
} };
`;

export const test = base.extend<{ googleDrive: SyntheticDrive }>({
  googleDrive: async ({ context }, use) => {
    const unexpected: string[] = [];
    let sequence = 0;
    const drive: SyntheticDrive = {
      files: new Map(),
      requests: [],
      owner: "synthetic-owner",
      permission: true,
      popupError: "",
      uploadStatus: 200,
      corruptReadback: false,
      async attach(context) {
        await context.exposeBinding("pennywiseTestConsent", () => ({
          popupError: drive.popupError,
          response: {
            access_token: "synthetic-memory-only-token",
            expires_in: 3600,
            scope: drive.permission
              ? "https://www.googleapis.com/auth/drive.file openid email"
              : "openid email",
          },
        }));
        await context.route(/^https:\/\//, async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          const method = request.method();
          const body = request.postData() ?? "";
          drive.requests.push({ method, path: url.pathname, body });
          const headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
          };
          const json = (value: unknown, status = 200) =>
            route.fulfill({
              status,
              headers,
              contentType: "application/json",
              body: JSON.stringify(value),
            });
          if (url.href === "https://accounts.google.com/gsi/client") {
            await route.fulfill({
              headers,
              contentType: "application/javascript",
              body: sdk,
            });
            return;
          }
          if (url.hostname !== "www.googleapis.com") {
            unexpected.push(url.origin + url.pathname);
            await route.abort("blockedbyclient");
            return;
          }
          if (method === "OPTIONS") {
            await route.fulfill({ status: 204, headers });
            return;
          }
          expect(request.headers().authorization).toBe(
            "Bearer synthetic-memory-only-token",
          );
          if (url.pathname === "/oauth2/v3/userinfo") {
            await json({
              sub: drive.owner,
              email: `${drive.owner}@example.test`,
              email_verified: true,
            });
            return;
          }
          const metadata = (file: StoredFile): DriveFile => ({
            id: file.id,
            name: file.name,
            createdTime: file.createdTime,
            size: file.size,
            appProperties: file.appProperties,
          });
          if (url.pathname === "/drive/v3/files" && method === "GET") {
            const folders = (url.searchParams.get("q") ?? "").includes(
              "mimeType = ",
            );
            await json({
              files: [...drive.files.values()]
                .filter((file) => !file.trashed && file.folder === folders)
                .sort((a, b) =>
                  (b.createdTime ?? "").localeCompare(a.createdTime ?? ""),
                )
                .map(metadata),
            });
            return;
          }
          if (
            method === "POST" &&
            ["/drive/v3/files", "/upload/drive/v3/files"].includes(url.pathname)
          ) {
            if (
              url.pathname.startsWith("/upload/") &&
              drive.uploadStatus !== 200
            ) {
              await json(
                { error: { message: "Synthetic provider failure" } },
                drive.uploadStatus,
              );
              return;
            }
            const multipart = url.pathname.startsWith("/upload/");
            const contentType = request.headers()["content-type"] ?? "";
            const boundary = contentType.split("boundary=")[1];
            const parts = multipart
              ? body
                  .split(`--${boundary}`)
                  .slice(1, -1)
                  .map((part) =>
                    part.slice(part.indexOf("\r\n\r\n") + 4).trim(),
                  )
              : [body];
            const properties = JSON.parse(parts[0]) as {
              name: string;
              appProperties: Record<string, string>;
            };
            const text = multipart ? parts[1] : "";
            const id = `synthetic-file-${++sequence}`;
            const file: StoredFile = {
              id,
              ...properties,
              text,
              folder: !multipart,
              trashed: false,
              size: String(Buffer.byteLength(text)),
              createdTime: new Date(Date.now() + sequence * 1000).toISOString(),
            };
            drive.files.set(id, file);
            await json(metadata(file));
            return;
          }
          const id = url.pathname.match(/^\/drive\/v3\/files\/([\w-]+)$/)?.[1];
          const file = id ? drive.files.get(id) : undefined;
          if (
            file &&
            method === "GET" &&
            url.searchParams.get("alt") === "media"
          ) {
            await route.fulfill({
              headers,
              contentType: "application/json",
              body: drive.corruptReadback ? "{}" : file.text,
            });
            return;
          }
          if (file && method === "PATCH") {
            const change = JSON.parse(body) as {
              trashed?: boolean;
              appProperties?: Record<string, string>;
            };
            file.trashed = change.trashed ?? file.trashed;
            Object.assign(file.appProperties, change.appProperties);
            await json(metadata(file));
            return;
          }
          unexpected.push(`${method} ${url.pathname}`);
          await json(
            { error: { message: "Unexpected synthetic request" } },
            404,
          );
        });
      },
    };
    await drive.attach(context);
    await use(drive);
    expect(unexpected).toEqual([]);
    expect(
      drive.requests.some((request) => request.path === "/gsi/client"),
    ).toBe(true);
  },
});
export { expect } from "@playwright/test";
