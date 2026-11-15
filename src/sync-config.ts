export const SYNC_PROJECT = import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "";
export const SYNC_CONFIGURED = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  SYNC_PROJECT &&
  import.meta.env.VITE_FIREBASE_APP_ID,
);
