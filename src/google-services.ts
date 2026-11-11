import { z } from "zod";

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}
interface GoogleLibrary {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        nonce: string;
        callback: (r: { credential: string }) => void;
        auto_select: boolean;
      }): void;
      renderButton(
        element: HTMLElement,
        options: { theme: string; size: string },
      ): void;
      disableAutoSelect(): void;
      revoke(hint: string, callback: () => void): void;
    };
    oauth2: {
      initTokenClient(options: {
        client_id: string;
        scope: string;
        include_granted_scopes: boolean;
        callback: (r: TokenResponse) => void;
        error_callback: () => void;
      }): { requestAccessToken(options: { prompt: string }): void };
      revoke(token: string, callback: () => void): void;
    };
  };
}
let loading: Promise<GoogleLibrary> | undefined;
export function googleLibrary(): Promise<GoogleLibrary> {
  if (!GOOGLE_CLIENT_ID)
    return Promise.reject(
      new Error(
        "Google Drive backup is not available yet. Manual backups still work.",
      ),
    );
  const existing = (window as Window & { google?: GoogleLibrary }).google;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      script.remove();
      loading = undefined;
      reject(new Error("Google is unavailable. Manual backups still work."));
    }, 15000);
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      const library = (window as Window & { google?: GoogleLibrary }).google;
      if (library) resolve(library);
      else {
        loading = undefined;
        reject(new Error("Google sign-in could not load"));
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(new Error("Google is unavailable. Manual backups still work."));
    };
    document.head.append(script);
  });
  return loading;
}
export interface GoogleIdentity {
  sub: string;
  email: string;
  expiresAt: number;
}
const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.literal(true),
  aud: z.string(),
  iss: z.string(),
  exp: z.number(),
  nonce: z.string(),
});
function jwtBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
export async function verifyGoogleIdentity(
  token: string,
  nonce: string,
): Promise<GoogleIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Google identity");
  const header = z
    .object({ alg: z.literal("RS256"), kid: z.string() })
    .parse(JSON.parse(new TextDecoder().decode(jwtBytes(parts[0]))));
  const claims = claimsSchema.parse(
    JSON.parse(new TextDecoder().decode(jwtBytes(parts[1]))),
  );
  if (
    claims.aud !== GOOGLE_CLIENT_ID ||
    !["accounts.google.com", "https://accounts.google.com"].includes(
      claims.iss,
    ) ||
    claims.exp * 1000 <= Date.now() ||
    claims.nonce !== nonce
  )
    throw new Error("Google session expired or could not be verified");
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    signal: AbortSignal.timeout(15000),
    credentials: "omit",
  });
  if (!response.ok) throw new Error("Google identity verification unavailable");
  const keys = (await response.json()) as {
    keys: (JsonWebKey & { kid: string })[];
  };
  const jwk = keys.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Google signing key unavailable; retry sign-in");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      jwtBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    ))
  )
    throw new Error("Google identity verification failed");
  return { sub: claims.sub, email: claims.email, expiresAt: claims.exp * 1000 };
}
export class GoogleSession {
  identity?: GoogleIdentity;
  private token?: {
    value: string;
    expiresAt: number;
    owner: string;
    email: string;
  };
  private identityGeneration = 0;
  private driveGeneration = 0;
  async renderSignIn(
    element: HTMLElement,
    changed: () => void,
    failed: (error: unknown) => void,
  ) {
    const library = await googleLibrary();
    const nonce = crypto.randomUUID();
    const generation = this.identityGeneration;
    library.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce,
      auto_select: false,
      callback: (result) => {
        void verifyGoogleIdentity(result.credential, nonce)
          .then((identity) => {
            if (generation !== this.identityGeneration) return;
            this.identity = identity;
            sessionStorage.setItem(
              "pennywise-google-identity",
              JSON.stringify({ token: result.credential, nonce }),
            );
            changed();
          })
          .catch(failed);
      },
    });
    library.accounts.id.renderButton(element, {
      theme: "outline",
      size: "large",
    });
  }
  async resume() {
    const generation = this.identityGeneration;
    const saved = sessionStorage.getItem("pennywise-google-identity");
    if (!saved) return;
    try {
      const value = z
        .object({ token: z.string(), nonce: z.string() })
        .parse(JSON.parse(saved));
      const identity = await verifyGoogleIdentity(value.token, value.nonce);
      if (generation === this.identityGeneration) this.identity = identity;
    } catch {
      sessionStorage.removeItem("pennywise-google-identity");
    }
  }
  signOut() {
    this.identityGeneration++;
    this.identity = undefined;
    sessionStorage.removeItem("pennywise-google-identity");
    (
      window as Window & { google?: GoogleLibrary }
    ).google?.accounts.id.disableAutoSelect();
  }
  get driveIdentity() {
    return this.token && this.token.expiresAt > Date.now()
      ? { sub: this.token.owner, email: this.token.email }
      : undefined;
  }
  async connectDrive(): Promise<void> {
    const library = await googleLibrary();
    const generation = ++this.driveGeneration;
    const token = await new Promise<TokenResponse>((resolve, reject) => {
      const client = library.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: `${DRIVE_SCOPE} openid email`,
        include_granted_scopes: false,
        callback: resolve,
        error_callback: () =>
          reject(
            new Error(
              "Google Drive connection cancelled. Local records are unchanged.",
            ),
          ),
      });
      client.requestAccessToken({ prompt: "select_account" });
    });
    if (
      !token.access_token ||
      token.error ||
      !token.scope?.split(" ").includes(DRIVE_SCOPE)
    )
      throw new Error("Google Drive permission was not granted");
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(15000),
        credentials: "omit",
      },
    );
    if (!response.ok)
      throw new Error("Could not identify the connected Google Drive account");
    const user = z
      .object({
        sub: z.string().min(1),
        email: z.string().email(),
        email_verified: z.literal(true),
      })
      .parse(await response.json());
    if (generation !== this.driveGeneration) return;
    this.token = {
      value: token.access_token,
      expiresAt: Date.now() + Math.max(0, (token.expires_in ?? 0) - 60) * 1000,
      owner: user.sub,
      email: user.email,
    };
  }
  async disconnectDrive() {
    this.driveGeneration++;
    const token = this.token;
    this.token = undefined;
    if (token) {
      const library = await googleLibrary();
      await new Promise<void>((resolve) =>
        library.accounts.oauth2.revoke(token.value, resolve),
      );
    }
  }
  accessToken(owner: string): string {
    if (
      !this.token ||
      this.token.expiresAt <= Date.now() ||
      this.token.owner !== owner
    )
      throw new DriveError("authorization", "Google Drive needs reconnection");
    return this.token.value;
  }
}
export class DriveError extends Error {
  constructor(
    public readonly kind: "authorization" | "transient" | "permanent",
    message: string,
  ) {
    super(message);
  }
}
const fileSchema = z.object({
  id: z.string().regex(/^[\w-]+$/),
  name: z.string(),
  createdTime: z.string().optional(),
  size: z.string().optional(),
  appProperties: z.record(z.string(), z.string()).default({}),
});
export type DriveFile = z.infer<typeof fileSchema>;
export class GoogleDriveRepository {
  constructor(
    private readonly session: GoogleSession,
    readonly owner: string,
  ) {}
  private async request(path: string, init: RequestInit = {}, upload = false) {
    let response: Response;
    try {
      response = await fetch(
        `https://www.googleapis.com/${upload ? "upload/" : ""}drive/v3/${path}`,
        {
          ...init,
          credentials: "omit",
          signal: AbortSignal.timeout(60000),
          headers: {
            ...init.headers,
            Authorization: `Bearer ${this.session.accessToken(this.owner)}`,
          },
        },
      );
    } catch (error) {
      if (error instanceof DriveError) throw error;
      throw new DriveError(
        "transient",
        "Network unavailable. Your pending backup is retained.",
      );
    }
    if (!response.ok) {
      const details: unknown = await response
        .clone()
        .json()
        .catch(() => undefined);
      const reason = z
        .object({
          error: z.object({
            errors: z.array(z.object({ reason: z.string() })).optional(),
          }),
        })
        .safeParse(details);
      const limited =
        reason.success &&
        reason.data.error.errors?.some((e) =>
          ["rateLimitExceeded", "userRateLimitExceeded"].includes(e.reason),
        );
      throw new DriveError(
        response.status === 401
          ? "authorization"
          : response.status === 429 || response.status >= 500 || limited
            ? "transient"
            : "permanent",
        response.status === 401
          ? "Google Drive needs reconnection"
          : response.status === 404
            ? "This backup was removed from Google Drive."
            : response.status === 403
              ? "Drive permission, quota or configuration prevents this operation. Reconnect or check your Drive storage."
              : "Google Drive could not complete this operation.",
      );
    }
    return response;
  }
  async list(folders = false): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const query = `trashed = false and appProperties has { key='application' and value='pennywise' } and mimeType ${folders ? "=" : "!="} 'application/vnd.google-apps.folder'`;
      const params = new URLSearchParams({
        q: query,
        fields: "nextPageToken,files(id,name,createdTime,size,appProperties)",
        pageSize: "100",
        orderBy: "createdTime desc",
        ...(pageToken ? { pageToken } : {}),
      });
      const page = z
        .object({
          nextPageToken: z.string().optional(),
          files: z.array(fileSchema),
        })
        .parse(await (await this.request(`files?${params}`)).json());
      files.push(...page.files);
      pageToken = page.nextPageToken;
      if (files.length > 5000)
        throw new Error("Too many backups to list safely");
    } while (pageToken);
    return files;
  }
  async upload(
    text: string,
    backupId: string,
    protectedBackup = false,
  ): Promise<DriveFile> {
    const existing = (await this.list()).find(
      (f) => f.appProperties.backupId === backupId,
    );
    if (existing) return existing;
    let folder = (await this.list(true))[0]?.id;
    if (!folder) {
      const created = await this.request("files?fields=id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Pennywise Backups",
          mimeType: "application/vnd.google-apps.folder",
          appProperties: { application: "pennywise" },
        }),
      });
      folder = z.object({ id: z.string() }).parse(await created.json()).id;
    }
    const boundary = `pennywise_${crypto.randomUUID()}`;
    const metadata = {
      name: `Pennywise-${backupId}.encrypted.json`,
      parents: [folder],
      mimeType: "application/json",
      appProperties: {
        application: "pennywise",
        backupId,
        protected: String(protectedBackup),
      },
    };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
    return fileSchema.parse(
      await (
        await this.request(
          "files?uploadType=multipart&fields=id,name,createdTime,size,appProperties",
          {
            method: "POST",
            headers: {
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body,
          },
          true,
        )
      ).json(),
    );
  }
  async download(file: DriveFile): Promise<string> {
    const response = await this.request(`files/${file.id}?alt=media`);
    const limit = 50_000_000;
    if (Number(response.headers.get("content-length")) > limit)
      throw new Error("Backup exceeds the 50 MB limit");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Backup download is unavailable");
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error("Backup exceeds the 50 MB limit");
        chunks.push(new Uint8Array(value));
      }
    } finally {
      await reader.cancel();
    }
    return new Blob(chunks).text();
  }
  async markVerified(file: DriveFile) {
    await this.request(`files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appProperties: { verified: "true" } }),
    });
  }
  async remove(file: DriveFile) {
    if (file.appProperties.application !== "pennywise")
      throw new Error("Not a Pennywise backup");
    await this.request(`files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
  }
}
