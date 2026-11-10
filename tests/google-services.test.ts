import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  GoogleDriveRepository,
  GoogleSession,
  DriveError,
  GOOGLE_CLIENT_ID,
  verifyGoogleIdentity,
} from "../src/google-services";

let key: CryptoKeyPair;
let jwk: JsonWebKey;
beforeAll(async () => {
  key = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  jwk = await crypto.subtle.exportKey("jwk", key.publicKey);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
async function token(change: Record<string, unknown> = {}) {
  const header = b64(
    new TextEncoder().encode(
      JSON.stringify({ alg: "RS256", kid: "synthetic-key" }),
    ),
  );
  const claims = b64(
    new TextEncoder().encode(
      JSON.stringify({
        sub: "synthetic-user",
        email: "synthetic@example.test",
        email_verified: true,
        aud: GOOGLE_CLIENT_ID,
        iss: "https://accounts.google.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: "synthetic-nonce",
        ...change,
      }),
    ),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key.privateKey,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${b64(new Uint8Array(signature))}`;
}
describe("Google application identity validation", () => {
  it("verifies signature, issuer, audience, expiry and nonce instead of trusting decoded JWT content", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ keys: [{ ...jwk, kid: "synthetic-key" }] }),
          ),
        ),
    );
    expect(
      await verifyGoogleIdentity(await token(), "synthetic-nonce"),
    ).toMatchObject({ sub: "synthetic-user", email: "synthetic@example.test" });
    for (const change of [
      { aud: "wrong-client" },
      { iss: "https://attacker.invalid" },
      { exp: 1 },
      { email_verified: false },
      { nonce: "wrong-nonce" },
    ])
      await expect(
        verifyGoogleIdentity(await token(change), "synthetic-nonce"),
      ).rejects.toThrow();
    const unsigned = (await token()).split(".").slice(0, 2).join(".") + ".AAAA";
    await expect(
      verifyGoogleIdentity(unsigned, "synthetic-nonce"),
    ).rejects.toThrow();
  });
  it("preserves offline/local access by failing identity verification without altering financial storage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(
      verifyGoogleIdentity(await token(), "synthetic-nonce"),
    ).rejects.toThrow();
    const session = new GoogleSession();
    expect(() => session.accessToken("synthetic-user")).toThrow(DriveError);
  });
});
function drive() {
  const session = new GoogleSession();
  vi.spyOn(session, "accessToken").mockReturnValue(
    "synthetic-memory-only-token",
  );
  return new GoogleDriveRepository(session, "synthetic-owner");
}
describe("Google Drive HTTP contract", () => {
  it("lists only application-owned files and paginates", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            nextPageToken: "page2",
            files: [
              {
                id: "one",
                name: "one",
                appProperties: { application: "pennywise" },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            files: [
              {
                id: "two",
                name: "two",
                appProperties: { application: "pennywise" },
              },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    expect(await drive().list()).toHaveLength(2);
    const first = new URL(fetch.mock.calls[0][0]);
    expect(first.searchParams.get("q")).toContain("appProperties has");
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("pageToken")).toBe(
      "page2",
    );
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer synthetic-memory-only-token",
    );
  });
  it("creates a visible folder then uploads encrypted bytes with non-financial filenames", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "folder" })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "backup",
            name: "Pennywise-synthetic.encrypted.json",
            appProperties: { application: "pennywise" },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await drive().upload('{"synthetic":"ciphertext"}', "synthetic-id");
    expect(fetch.mock.calls[2][1].body).toContain("Pennywise Backups");
    expect(fetch.mock.calls[3][0]).toContain("uploadType=multipart");
    expect(fetch.mock.calls[3][1].body).toContain('{"synthetic":"ciphertext"}');
    expect(fetch.mock.calls[3][1].body).not.toContain(
      "synthetic-memory-only-token",
    );
  });
  it.each([
    [401, "authorization"],
    [403, "permanent"],
    [404, "permanent"],
    [429, "transient"],
    [500, "transient"],
  ])(
    "classifies HTTP %s without leaking raw provider responses",
    async (status, kind) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response("sensitive provider response", {
            status: Number(status),
          }),
        ),
      );
      await expect(drive().list()).rejects.toMatchObject({ kind });
    },
  );
  it("distinguishes rate limiting from permanent quota failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { errors: [{ reason: "rateLimitExceeded" }] },
          }),
          { status: 403 },
        ),
      ),
    );
    await expect(drive().list()).rejects.toMatchObject({ kind: "transient" });
  });
  it("does not create another file after an interrupted upload is discovered by stable backup ID", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          files: [
            {
              id: "existing",
              name: "Existing",
              appProperties: {
                backupId: "stable-id",
                application: "pennywise",
              },
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    expect((await drive().upload("ciphertext", "stable-id")).id).toBe(
      "existing",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds cloud downloads before decryption", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("ciphertext", {
          headers: { "content-length": "50000001" },
        }),
      ),
    );
    await expect(
      drive().download({ id: "backup", name: "Backup", appProperties: {} }),
    ).rejects.toThrow(/50 MB/);
  });
});
