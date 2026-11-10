import { z } from "zod";
import {
  APP_VERSION,
  fullBackup,
  inspectBackup,
  type BackupPreview,
} from "./backup";
import type { State } from "./domain";

const wrappedSchema = z
  .object({
    salt: z.string().max(64),
    iv: z.string().max(64),
    data: z.string().max(200),
  })
  .strict();
const metadataSchema = z
  .object({
    format: z.literal("pennywise-cloud-v1"),
    backupId: z.string().uuid(),
    deviceId: z.string().uuid(),
    createdAt: z.string().datetime(),
    appVersion: z.string().max(40),
    schemaVersion: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
    algorithm: z.literal("AES-256-GCM"),
    kdf: z.literal("PBKDF2-SHA-256"),
    iterations: z.literal(600000),
  })
  .strict();
export const cloudEnvelopeSchema = z
  .object({
    metadata: metadataSchema,
    password: wrappedSchema,
    recovery: wrappedSchema.optional(),
    iv: z.string().max(64),
    data: z.string().max(70_000_000),
  })
  .strict();
type Metadata = z.infer<typeof metadataSchema>;
type Wrapped = z.infer<typeof wrappedSchema>;
const encode = (s: string) => new TextEncoder().encode(s);
function base64(bytes: Uint8Array): string {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.slice(i, i + 8192));
  return btoa(value);
}
function decode(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function aad(meta: Metadata): Uint8Array<ArrayBuffer> {
  return encode(JSON.stringify(metadataSchema.parse(meta)));
}
async function derive(secret: string, salt: Uint8Array<ArrayBuffer>) {
  if (secret.length < 12)
    throw new Error("Use a passphrase of at least 12 characters");
  const raw = await crypto.subtle.importKey(
    "raw",
    encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function wrap(
  raw: Uint8Array<ArrayBuffer>,
  secret: string,
  metadata: Metadata,
): Promise<Wrapped> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(metadata) },
    await derive(secret, salt),
    raw,
  );
  return {
    salt: base64(salt),
    iv: base64(iv),
    data: base64(new Uint8Array(data)),
  };
}
async function unwrap(value: Wrapped, secret: string, metadata: Metadata) {
  const salt = decode(value.salt),
    iv = decode(value.iv);
  if (
    salt.length !== 16 ||
    iv.length !== 12 ||
    decode(value.data).length !== 48
  )
    throw new Error("Invalid encrypted key");
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad(metadata) },
      await derive(secret, salt),
      decode(value.data),
    ),
  );
}
export function newRecoveryKey(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function createCloudBackup(
  state: State,
  password: string,
  deviceId: string,
  recovery?: string,
): Promise<string> {
  const metadata = metadataSchema.parse({
    format: "pennywise-cloud-v1",
    backupId: crypto.randomUUID(),
    deviceId,
    createdAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    schemaVersion: state.version,
    revision: state.revision,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 600000,
  });
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(metadata) },
    key,
    encode(await fullBackup(state)),
  );
  return JSON.stringify({
    metadata,
    password: await wrap(raw, password, metadata),
    ...(recovery ? { recovery: await wrap(raw, recovery, metadata) } : {}),
    iv: base64(iv),
    data: base64(new Uint8Array(data)),
  });
}
export async function inspectCloudBackup(
  text: string,
  secret: string,
  useRecovery = false,
): Promise<BackupPreview> {
  if (text.length > 50_000_000)
    throw new Error("Backup exceeds the 50 MB limit");
  try {
    const envelope = cloudEnvelopeSchema.parse(JSON.parse(text));
    const wrapper = useRecovery ? envelope.recovery : envelope.password;
    if (!wrapper) throw new Error("No recovery key on this backup");
    const raw = await unwrap(wrapper, secret, envelope.metadata);
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "decrypt",
    ]);
    const iv = decode(envelope.iv);
    if (iv.length !== 12) throw new Error("Invalid IV");
    const data = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad(envelope.metadata) },
      key,
      decode(envelope.data),
    );
    const preview = await inspectBackup(new TextDecoder().decode(data));
    if (
      preview.state.version !== envelope.metadata.schemaVersion ||
      preview.state.revision !== envelope.metadata.revision
    )
      throw new Error("Backup metadata does not match");
    return preview;
  } catch {
    throw new Error(
      "Cannot unlock backup. Check the passphrase or recovery key; the file may be damaged or incompatible.",
    );
  }
}
export async function rewrapCloudBackup(
  text: string,
  oldSecret: string,
  newPassword: string,
  recovery = false,
): Promise<string> {
  await inspectCloudBackup(text, oldSecret, recovery);
  const envelope = cloudEnvelopeSchema.parse(JSON.parse(text));
  const wrapper = recovery ? envelope.recovery : envelope.password;
  if (!wrapper) throw new Error("No recovery wrapper");
  const raw = await unwrap(wrapper, oldSecret, envelope.metadata);
  envelope.password = await wrap(raw, newPassword, envelope.metadata);
  return JSON.stringify(envelope);
}
