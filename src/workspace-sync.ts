import { z } from "zod";
import type { State } from "./domain";
import { createCloudBackup, inspectCloudBackup } from "./cloud-crypto";
import {
  workspaceDigest,
  SyncConflict,
  type SyncHead,
  type SyncRemote,
} from "./sync-protocol";
import { auxiliaryRead, auxiliaryUpdate } from "./auxiliary-storage";
import { connectionGuidance } from "./connection-errors";

const bindingSchema = z
  .object({
    owner: z.string(),
    project: z.string(),
    deviceId: z.string().uuid(),
    enabled: z.boolean(),
    linked: z.boolean(),
    baseRemote: z.string().uuid().nullable(),
    baseDigest: z.string(),
  })
  .strict();
export type SyncBinding = z.infer<typeof bindingSchema>;
export interface SyncLocal {
  read(): Promise<State>;
  replace(state: State, expectedRevision: number): Promise<State>;
  canApply(): boolean;
}
export interface SyncMarkers {
  read(): Promise<SyncBinding | undefined>;
  write(value: SyncBinding): Promise<void>;
}
export const syncMarkers: SyncMarkers = {
  async read() {
    const value = await auxiliaryRead("workspace-sync", undefined);
    return value ? bindingSchema.parse(value) : undefined;
  },
  async write(value) {
    await auxiliaryUpdate("workspace-sync", () => bindingSchema.parse(value));
  },
};
export type SyncPhase =
  | "off"
  | "locked"
  | "review"
  | "synced"
  | "pending"
  | "syncing"
  | "conflict"
  | "error";
export interface SyncStatus {
  phase: SyncPhase;
  message: string;
}
export interface SyncReview {
  remote: State | null;
  localRevision: number;
  remoteId: string | null;
  local: State;
}
export class WorkspaceSync {
  status: SyncStatus = {
    phase: "off",
    message: "Cross-device sync is off. Local records are unchanged.",
  };
  private secret = "";
  private generation = 0;
  private running = false;
  private unsubscribe?: () => void;
  private cached?: { id: string; state: State };
  remote?: SyncRemote;
  review?: SyncReview;
  constructor(
    private readonly local: SyncLocal,
    private readonly markers = syncMarkers,
    private readonly changed: () => void = () => undefined,
  ) {}
  private show(phase: SyncPhase, message: string) {
    this.status = { phase, message };
    this.changed();
  }
  private context() {
    return `firebase:${this.remote!.project}:${this.remote!.owner}:main`;
  }
  private async binding() {
    const binding = await this.markers.read();
    if (
      !binding ||
      !this.remote ||
      binding.owner !== this.remote.owner ||
      binding.project !== this.remote.project
    )
      throw new Error(
        "This local workspace is linked to a different Google account or project. Reconnect its original account; no records were transferred.",
      );
    return binding;
  }
  async connect(remote: SyncRemote) {
    if (this.remote) await remote.close();
    if (this.remote)
      throw new Error("Disconnect the current sync session first.");
    try {
      const existing = await this.markers.read();
      if (
        existing &&
        (existing.owner !== remote.owner || existing.project !== remote.project)
      ) {
        throw new Error(
          "This local workspace is linked to a different Google account or project. Use a separate browser profile or reconnect its original account.",
        );
      }
      if (!existing)
        await this.markers.write({
          owner: remote.owner,
          project: remote.project,
          deviceId: crypto.randomUUID(),
          enabled: false,
          linked: false,
          baseRemote: null,
          baseDigest: "",
        });
      this.remote = remote;
      this.show(
        "locked",
        "Google account connected. Unlock this workspace with its sync passphrase.",
      );
    } catch (error) {
      await remote.close().catch(() => undefined);
      throw error;
    }
  }
  async unlock(secret: string, confirmation: string) {
    if (secret.length < 12 || secret !== confirmation)
      throw new Error(
        "Use matching sync passphrases of at least 12 characters.",
      );
    if (!this.remote)
      throw new Error("Connect Google for cross-device sync first.");
    if (this.running) throw new Error("Wait for the current sync operation.");
    this.running = true;
    let resume = false;
    try {
      const generation = this.generation;
      const binding = await this.binding();
      const head = await this.remote.head();
      const remote = head ? await this.decode(head, secret) : null;
      if (generation !== this.generation) return;
      this.secret = secret;
      if (binding.linked && binding.enabled) {
        this.subscribe();
        resume = true;
      } else {
        const local = await this.local.read();
        this.review = {
          remote,
          local,
          localRevision: local.revision,
          remoteId: head?.id ?? null,
        };
        this.show(
          "review",
          remote
            ? "Cloud workspace found. Review before replacing this device. Both versions will not be merged."
            : "No cloud workspace exists for this account. Confirm before publishing this device's records.",
        );
      }
    } finally {
      this.running = false;
    }
    if (resume) await this.run();
  }
  private subscribe() {
    this.unsubscribe?.();
    this.unsubscribe = this.remote!.watch(
      () => {
        void this.run(true);
      },
      (error) => this.fail(error),
    );
  }
  async exportReview(choice: "local" | "remote") {
    const binding = await this.binding();
    const state = this.review?.[choice];
    if (!state || !this.secret)
      throw new Error("Review and unlock the workspace first.");
    return createCloudBackup(state, this.secret, binding.deviceId);
  }
  private async decode(head: SyncHead, secret = this.secret) {
    if (this.cached?.id === head.id && secret === this.secret && this.secret)
      return this.cached.state;
    const state = (
      await inspectCloudBackup(
        await this.remote!.read(head),
        secret,
        false,
        this.context(),
      )
    ).state;
    if (secret === this.secret && this.secret)
      this.cached = { id: head.id, state };
    return state;
  }
  private fail(error: unknown) {
    this.show(
      error instanceof SyncConflict ? "conflict" : "error",
      connectionGuidance(error) ??
        (error instanceof Error
          ? error.message
          : "Sync could not finish. Local records and Drive backups remain available."),
    );
  }
  async inspectConflict() {
    if (!this.remote || !this.secret)
      throw new Error("Connect and unlock sync first.");
    if (this.running) throw new Error("Wait for the current sync operation.");
    this.running = true;
    try {
      const head = await this.remote.head();
      const remote = head ? await this.decode(head) : null;
      const local = await this.local.read();
      this.review = {
        remote,
        local,
        localRevision: local.revision,
        remoteId: head?.id ?? null,
      };
      this.show(
        "review",
        "Review both versions. Choosing one replaces the other; automatic merging is not supported.",
      );
    } finally {
      this.running = false;
    }
  }
  async choose(choice: "local" | "remote") {
    if (this.running || !this.secret || !this.remote || !this.review)
      throw new Error("Review and unlock the versions first.");
    if (!navigator.locks)
      throw new Error(
        "This browser lacks cross-tab sync locking. Local records and Drive backups remain available.",
      );
    this.running = true;
    try {
      await navigator.locks.request("pennywise-workspace-sync", {}, async () =>
        this.applyChoice(choice),
      );
    } finally {
      this.running = false;
    }
  }
  private async applyChoice(choice: "local" | "remote") {
    if (!this.remote || !this.review)
      throw new Error("Review the versions again.");
    const review = this.review;
    const binding = await this.binding();
    if ((await this.local.read()).revision !== review.localRevision)
      throw new Error("Local records changed. Review both versions again.");
    if ((await this.remote.head())?.id !== (review.remoteId ?? undefined))
      throw new SyncConflict();
    if (choice === "remote") {
      if (!review.remote || !this.local.canApply())
        throw new Error(
          "Finish or close open forms before applying cloud records.",
        );
      await this.local.replace(review.remote, review.localRevision);
      await this.markers.write({
        ...binding,
        enabled: true,
        linked: true,
        baseRemote: review.remoteId,
        baseDigest: await workspaceDigest(review.remote),
      });
    } else {
      const head = await this.remote.commit(
        review.remoteId,
        await createCloudBackup(
          review.local,
          this.secret,
          binding.deviceId,
          undefined,
          this.context(),
        ),
      );
      await this.markers.write({
        ...binding,
        enabled: true,
        linked: true,
        baseRemote: head.id,
        baseDigest: await workspaceDigest(review.local),
      });
    }
    this.review = undefined;
    this.show(
      "synced",
      "Workspace linked. Changes sync while devices are open, signed in and unlocked.",
    );
    this.subscribe();
  }
  async run(automatic = false) {
    if (
      this.running ||
      !this.remote ||
      !this.secret ||
      this.review ||
      (automatic && this.status.phase === "error") ||
      this.status.phase === "conflict"
    )
      return;
    this.running = true;
    const generation = this.generation;
    try {
      const binding = await this.binding();
      if (!binding.enabled || !binding.linked) return;
      if (!navigator.onLine) {
        this.show(
          "pending",
          "Offline changes stay on this device. Sync resumes when connected and unlocked.",
        );
        return;
      }
      if (!navigator.locks)
        throw new Error(
          "This browser lacks cross-tab sync locking. Keep using local records and Drive backups.",
        );
      await navigator.locks.request(
        "pennywise-workspace-sync",
        { ifAvailable: true },
        async (lock) => {
          if (!lock || generation !== this.generation) return;
          const currentBinding = await this.binding();
          if (!currentBinding.enabled) return;
          const local = await this.local.read();
          const digest = await workspaceDigest(local);
          const head = await this.remote!.head();
          if (generation !== this.generation) return;
          if (!head)
            throw new Error(
              "The linked cloud workspace is missing. Nothing was republished; review sync before continuing.",
            );
          if (head.id === currentBinding.baseRemote) {
            if (digest === currentBinding.baseDigest) {
              this.show(
                "synced",
                "This device matches the last synchronized workspace.",
              );
              return;
            }
            this.show("syncing", "Encrypting and sending local changes…");
            const text = await createCloudBackup(
              local,
              this.secret,
              currentBinding.deviceId,
              undefined,
              this.context(),
            );
            if (generation !== this.generation) return;
            const next = await this.remote!.commit(head.id, text);
            if (generation !== this.generation) return;
            await this.markers.write({
              ...currentBinding,
              baseRemote: next.id,
              baseDigest: digest,
            });
            this.show(
              "synced",
              "Local snapshot synchronized. Newer edits, if any, remain queued locally.",
            );
          } else {
            const remote = await this.decode(head);
            const remoteDigest = await workspaceDigest(remote);
            if (generation !== this.generation) return;
            if (digest === remoteDigest) {
              await this.markers.write({
                ...currentBinding,
                baseRemote: head.id,
                baseDigest: digest,
              });
            } else {
              if (digest !== currentBinding.baseDigest)
                throw new SyncConflict();
              if (!this.local.canApply()) {
                this.show(
                  "pending",
                  "New cloud changes are waiting. Close open forms to apply them safely.",
                );
                return;
              }
              this.show(
                "syncing",
                "Applying authenticated cloud changes with a local safety snapshot…",
              );
              await this.local.replace(remote, local.revision);
              await this.markers.write({
                ...currentBinding,
                baseRemote: head.id,
                baseDigest: remoteDigest,
              });
            }
            this.show("synced", "Cloud changes synchronized to this device.");
          }
        },
      );
    } catch (error) {
      this.fail(error);
    } finally {
      this.running = false;
    }
  }
  async pause() {
    if (this.running)
      throw new Error("Wait for the current sync operation before pausing.");
    this.generation++;
    this.secret = "";
    this.cached = undefined;
    this.review = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    const binding = await this.markers.read();
    if (binding) await this.markers.write({ ...binding, enabled: false });
    const remote = this.remote;
    this.remote = undefined;
    if (remote) await remote.close();
    this.show(
      "off",
      "Sync paused and encryption locked. Local data and account binding are retained.",
    );
  }
  lock() {
    if (this.running)
      throw new Error("Wait for the current sync operation before locking.");
    this.generation++;
    this.secret = "";
    this.cached = undefined;
    this.review = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.show(
      "locked",
      "Sync encryption locked. Local data remains available on this device.",
    );
  }
}
