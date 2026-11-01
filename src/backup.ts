import { z } from "zod";
import { migrate } from "./storage";
import type { State } from "./domain";
import { validateState } from "./engine";

export const APP_VERSION = "1.1.0";
const fullBackupSchema = z
  .object({
    format: z.literal("pennywise-full-backup"),
    backupVersion: z.literal(1),
    schemaVersion: z.number().int(),
    appVersion: z.string().min(1).max(40),
    createdAt: z.string().datetime(),
    integrity: z
      .object({
        algorithm: z.literal("SHA-256"),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    data: z.unknown(),
  })
  .strict();
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
async function digest(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(value)),
  );
  return [...new Uint8Array(hash)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export interface BackupPreview {
  state: State;
  createdAt: string;
  appVersion: string;
  integrityVerified: boolean;
}
export async function fullBackup(s: State): Promise<string> {
  const data = validateState(s);
  const metadata = {
    format: "pennywise-full-backup" as const,
    backupVersion: 1 as const,
    schemaVersion: data.version,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    data,
  };
  const output = JSON.stringify(
    {
      ...metadata,
      integrity: { algorithm: "SHA-256", digest: await digest(metadata) },
    },
    null,
    2,
  );
  if (output.length > 35_000_000)
    throw new Error(
      "Database backup exceeds the portable backup limit (35 MB before encryption). Reduce large attachments first.",
    );
  return output;
}

const envelopeSchema = z
  .object({
    format: z.literal("pennywise-encrypted-v1"),
    algorithm: z.literal("AES-GCM"),
    iterations: z.literal(600000),
    salt: z.string().max(64),
    iv: z.string().max(64),
    data: z.string().max(70_000_000),
  })
  .strict();
function base64(value: Uint8Array): string {
  let out = "";
  for (let i = 0; i < value.length; i += 8192)
    out += String.fromCharCode(...value.slice(i, i + 8192));
  return btoa(out);
}
function bytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (s) => s.charCodeAt(0));
}
async function key(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (password.length < 12)
    throw new Error("Backup passphrase must have at least 12 characters");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptBackup(
  s: State,
  password: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const derived = await key(password, salt);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derived,
    new TextEncoder().encode(await fullBackup(s)),
  );
  return JSON.stringify({
    format: "pennywise-encrypted-v1",
    algorithm: "AES-GCM",
    iterations: 600000,
    salt: base64(salt),
    iv: base64(iv),
    data: base64(new Uint8Array(data)),
  });
}
export async function inspectBackup(
  text: string,
  password = "",
): Promise<BackupPreview> {
  if (text.length > 50_000_000)
    throw new Error("Backup exceeds the 50 MB import limit");
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("Invalid backup JSON");
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "format" in input &&
    input.format === "pennywise-encrypted-v1"
  ) {
    const e = envelopeSchema.parse(input);
    const salt = bytes(e.salt);
    const iv = bytes(e.iv);
    if (salt.length !== 16 || iv.length !== 12)
      throw new Error("Invalid encryption envelope");
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        await key(password, salt),
        bytes(e.data),
      );
      input = JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
      throw new Error("Wrong passphrase or damaged encrypted backup");
    }
  }
  if (typeof input === "object" && input !== null && "format" in input) {
    const b = fullBackupSchema.parse(input);
    const { integrity, ...metadata } = b;
    if ((await digest(metadata)) !== integrity.digest)
      throw new Error(
        "Backup integrity check failed; the file is incomplete or altered",
      );
    if (
      typeof b.data !== "object" ||
      b.data === null ||
      !("version" in b.data) ||
      b.data.version !== b.schemaVersion
    )
      throw new Error("Backup schema metadata does not match its data");
    return {
      state: migrate(b.data),
      createdAt: b.createdAt,
      appVersion: b.appVersion,
      integrityVerified: true,
    };
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "version" in input &&
    input.version === 3
  )
    throw new Error("Current-schema backup is missing its integrity envelope");
  return {
    state: migrate(input),
    createdAt: "Legacy backup (timestamp unavailable)",
    appVersion: "Legacy",
    integrityVerified: false,
  };
}
export async function decodeBackup(
  text: string,
  password = "",
): Promise<State> {
  return (await inspectBackup(text, password)).state;
}
