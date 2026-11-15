import { initializeApp, deleteApp, type FirebaseOptions } from "firebase/app";
import {
  initializeAuth,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  initializeFirestore,
  doc,
  getDocFromServer,
  runTransaction,
  onSnapshot,
  terminate,
  type Firestore,
} from "firebase/firestore";
import {
  splitSyncCiphertext,
  syncHeadSchema,
  syncDigest,
  SyncConflict,
  type SyncHead,
  type SyncRemote,
} from "./sync-protocol";

export const FIREBASE_SYNC_CONFIG: FirebaseOptions | undefined =
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID &&
  import.meta.env.VITE_FIREBASE_APP_ID
    ? {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
        authDomain: `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      }
    : undefined;

export async function connectFirebaseSync(): Promise<SyncRemote> {
  if (!FIREBASE_SYNC_CONFIG)
    throw new Error(
      "Cross-device sync needs one-time application-owner setup. Local records and Drive backups still work.",
    );
  const app = initializeApp(
    FIREBASE_SYNC_CONFIG,
    `pennywise-sync-${crypto.randomUUID()}`,
  );
  const auth = initializeAuth(app, {
    persistence: inMemoryPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  const db = initializeFirestore(app, { ignoreUndefinedProperties: false });
  const close = async () => {
    try {
      await signOut(auth);
    } finally {
      try {
        await terminate(db);
      } finally {
        await deleteApp(app);
      }
    }
  };
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await signInWithPopup(auth, provider);
    const owner = result.user.uid;
    if (
      !result.user.emailVerified ||
      !result.user.providerData.some((p) => p.providerId === "google.com")
    )
      throw new Error("A verified Google account is required for sync.");
    return firestoreSyncRemote(
      db,
      owner,
      FIREBASE_SYNC_CONFIG.projectId!,
      close,
    );
  } catch (error) {
    await close().catch(() => undefined);
    throw error;
  }
}
export function firestoreSyncRemote(
  db: Firestore,
  owner: string,
  project: string,
  close: () => Promise<void>,
): SyncRemote {
  const headRef = doc(db, "users", owner, "workspaces", "main");
  const chunk = (id: string, index: number) =>
    doc(db, "users", owner, "snapshots", id, "chunks", String(index));
  return {
    owner,
    project,
    close,
    async head() {
      const snapshot = await getDocFromServer(headRef);
      return snapshot.exists() ? syncHeadSchema.parse(snapshot.data()) : null;
    },
    async read(head) {
      const parts = await Promise.all(
        Array.from({ length: head.chunks }, async (_, index) => {
          const value = (await getDocFromServer(chunk(head.id, index))).data();
          if (
            typeof value?.ciphertext !== "string" ||
            value.ciphertext.length > 200_000
          )
            throw new Error(
              "Cloud snapshot is incomplete. Retry; no local records were changed.",
            );
          return value.ciphertext;
        }),
      );
      const text = parts.join("");
      if ((await syncDigest(text)) !== head.digest)
        throw new Error(
          "Cloud snapshot integrity failed. Local records are unchanged.",
        );
      return text;
    },
    async commit(expected, text) {
      const parts = splitSyncCiphertext(text);
      const id = crypto.randomUUID();
      const digest = await syncDigest(text);
      return runTransaction(
        db,
        async (transaction) => {
          const current = await transaction.get(headRef);
          const previous = current.exists()
            ? syncHeadSchema.parse(current.data())
            : null;
          if ((previous?.id ?? null) !== expected) throw new SyncConflict();
          const next: SyncHead = {
            protocol: 1,
            id,
            chunks: parts.length,
            digest,
            previous: previous
              ? { id: previous.id, chunks: previous.chunks }
              : null,
          };
          parts.forEach((ciphertext, index) =>
            transaction.set(chunk(id, index), { ciphertext }),
          );
          transaction.set(headRef, next);
          // Retain the previous committed snapshot so readers can finish safely.
          if (previous?.previous)
            for (let i = 0; i < previous.previous.chunks; i++)
              transaction.delete(chunk(previous.previous.id, i));
          return next;
        },
        { maxAttempts: 3 },
      );
    },
    watch(changed, failed) {
      return onSnapshot(
        headRef,
        { includeMetadataChanges: false },
        (snapshot) => {
          if (!snapshot.metadata.fromCache) changed();
        },
        failed,
      );
    },
  };
}
