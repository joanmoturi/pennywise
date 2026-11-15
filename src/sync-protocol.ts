import { z } from "zod";
import type { State } from "./domain";

export const SYNC_CHUNK_SIZE = 200_000;
export const SYNC_MAX_CHUNKS = 16;
export const SYNC_MAX_BYTES = SYNC_CHUNK_SIZE * SYNC_MAX_CHUNKS;
export const syncHeadSchema = z
  .object({
    protocol: z.literal(1),
    id: z.string().uuid(),
    chunks: z.number().int().min(1).max(SYNC_MAX_CHUNKS),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    previous: z
      .object({
        id: z.string().uuid(),
        chunks: z.number().int().min(1).max(SYNC_MAX_CHUNKS),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type SyncHead = z.infer<typeof syncHeadSchema>;
export interface SyncRemote {
  readonly owner: string;
  readonly project: string;
  head(): Promise<SyncHead | null>;
  read(head: SyncHead): Promise<string>;
  commit(expected: string | null, text: string): Promise<SyncHead>;
  watch(changed: () => void, failed: (error: unknown) => void): () => void;
  close(): Promise<void>;
}
export class SyncConflict extends Error {
  constructor() {
    super(
      "Another device changed the cloud workspace. Review both versions before continuing.",
    );
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function syncDigest(text: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function workspaceDigest(state: State): Promise<string> {
  // Local revision and restore audit differ per device; financial content does not.
  const { revision: _revision, audit: _audit, ...workspace } = state;
  void _revision;
  void _audit;
  return syncDigest(canonical(workspace));
}
export function splitSyncCiphertext(text: string): string[] {
  if (!text.length || new TextEncoder().encode(text).length > SYNC_MAX_BYTES)
    throw new Error(
      "Encrypted sync workspace exceeds the 3.2 MB limit. Keep larger workspaces/receipts in local storage and use encrypted Drive backups.",
    );
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += SYNC_CHUNK_SIZE)
    parts.push(text.slice(i, i + SYNC_CHUNK_SIZE));
  return parts;
}
