import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  setDoc,
  collection,
  getDocsFromServer,
  type Firestore,
} from "firebase/firestore";
import { firestoreSyncRemote } from "../src/firebase-sync";
import { SyncConflict } from "../src/sync-protocol";

let environment: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-pennywise",
    firestore: {
      host: "127.0.0.1",
      port: 8088,
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
});
afterAll(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
  await environment?.cleanup();
});
function client(
  uid: string,
  verified = true,
  provider: "google.com" | "password" = "google.com",
): Firestore {
  const app = initializeApp(
    { projectId: "demo-pennywise", apiKey: "synthetic", appId: "synthetic" },
    crypto.randomUUID(),
  );
  apps.push(app);
  const db = initializeFirestore(app, {});
  connectFirestoreEmulator(db, "127.0.0.1", 8088, {
    mockUserToken: {
      sub: uid,
      email: `${uid}@example.test`,
      email_verified: verified,
      firebase: { sign_in_provider: provider, identities: {} },
    },
  });
  return db;
}
describe("deployed-rule contract against official Firestore emulator", () => {
  it("permits owner ciphertext transactions and rejects another UID, unverified and non-Google accounts", async () => {
    const db = client("owner");
    const remote = firestoreSyncRemote(
      db,
      "owner",
      "demo-pennywise",
      async () => undefined,
    );
    const head = await remote.commit(null, "synthetic-encrypted-payload");
    expect(await remote.read(head)).toBe("synthetic-encrypted-payload");
    for (const other of [
      client("stranger"),
      client("owner", false),
      client("owner", true, "password"),
    ]) {
      await assertFails(
        getDocFromServer(doc(other, "users/owner/workspaces/main")),
      );
      await assertFails(
        setDoc(
          doc(other, `users/owner/snapshots/${crypto.randomUUID()}/chunks/0`),
          { ciphertext: "x" },
        ),
      );
    }
    await assertFails(
      environment
        .unauthenticatedContext()
        .firestore()
        .doc("users/owner/workspaces/main")
        .get(),
    );
    await assertFails(
      getDocsFromServer(collection(db, "users/owner/workspaces")),
    );
  });
  it("rejects extra plaintext fields, oversized chunks and mutable chunks", async () => {
    const db = client("owner");
    const ref = doc(
      db,
      `users/owner/snapshots/${crypto.randomUUID()}/chunks/0`,
    );
    await assertFails(setDoc(ref, { ciphertext: "x", accountBalance: 1200 }));
    await assertFails(setDoc(ref, { ciphertext: "x".repeat(200001) }));
    await assertSucceeds(setDoc(ref, { ciphertext: "encrypted" }));
    await assertFails(setDoc(ref, { ciphertext: "replacement" }));
    await assertFails(
      setDoc(doc(db, "users/owner/workspaces/main"), {
        protocol: 1,
        id: crypto.randomUUID(),
        chunks: 99,
        digest: "a".repeat(64),
        previous: null,
      }),
    );
    await assertFails(
      setDoc(doc(db, "financial-records/public"), { amount: 1 }),
    );
  });
  it("atomically chunks, retains one previous version, prunes older chunks and refuses stale writers", async () => {
    const db = client("owner");
    const a = firestoreSyncRemote(
      db,
      "owner",
      "demo-pennywise",
      async () => undefined,
    );
    const b = firestoreSyncRemote(
      client("owner"),
      "owner",
      "demo-pennywise",
      async () => undefined,
    );
    const first = await a.commit(null, "a".repeat(400001));
    expect(first.chunks).toBe(3);
    expect(await b.read(first)).toBe("a".repeat(400001));
    const second = await b.commit(first.id, "b".repeat(200001));
    await expect(a.commit(first.id, "stale")).rejects.toBeInstanceOf(
      SyncConflict,
    );
    expect(await a.read(first)).toBe("a".repeat(400001));
    const third = await a.commit(second.id, "c".repeat(200001));
    expect(await b.head()).toEqual(third);
    expect(
      (
        await getDocFromServer(
          doc(db, `users/owner/snapshots/${first.id}/chunks/0`),
        )
      ).exists(),
    ).toBe(false);
    expect(await a.read(second)).toBe("b".repeat(200001));
  });
  it("allows exactly one simultaneous compare-and-swap writer to win", async () => {
    const a = firestoreSyncRemote(
      client("owner"),
      "owner",
      "demo-pennywise",
      async () => undefined,
    );
    const b = firestoreSyncRemote(
      client("owner"),
      "owner",
      "demo-pennywise",
      async () => undefined,
    );
    const initial = await a.commit(null, "initial");
    const results = await Promise.allSettled([
      a.commit(initial.id, "first"),
      b.commit(initial.id, "second"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });
});
