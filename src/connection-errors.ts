export function connectionGuidance(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return;
  switch (error.code) {
    case "auth/popup-blocked":
    case "popup_failed_to_open":
      return "Google's account chooser could not open. Allow popups for Pennywise, then select Connect again. If your installed PWA still cannot open it, try the same Pennywise address in your normal browser. Do not clear site data or uninstall; local records are unchanged.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "popup_closed":
      return "Google connection was cancelled. Select Connect again when ready; local records are unchanged.";
    case "auth/network-request-failed":
    case "unavailable":
    case "deadline-exceeded":
      return "Google or sync could not be reached. Check your connection and try again. Keep using local records or a manual full backup; do not clear site data.";
    case "auth/unauthorized-domain":
    case "auth/operation-not-allowed":
    case "auth/invalid-api-key":
    case "auth/app-not-authorized":
    case "auth/operation-not-supported-in-this-environment":
      return "Google sign-in is unavailable for this address or browser configuration. The app owner needs to check the Google/Firebase setup. You can still use local records and manual backups; reinstalling or clearing data will not fix this.";
    case "auth/too-many-requests":
    case "resource-exhausted":
      return "Google or sync has temporarily limited requests or reached its quota. Stop repeated retries and try later; the app owner may need to review usage. Do not enable billing just to dismiss this error. Keep a manual full backup.";
    case "auth/user-token-expired":
    case "auth/invalid-user-token":
    case "unauthenticated":
      return "Your Google sync authorization expired. Pause and disconnect sync, then reconnect the same Google account. Local records are retained; do not reset the workspace.";
    case "permission-denied":
      return "Sync access was denied. Reconnect the Google account linked to this workspace. If it persists, the app owner must check access rules and configuration; do not weaken security rules or clear local data.";
    case "access_denied":
      return "Google Drive permission was not granted. Reconnect and review the requested permission if you want Drive backup. Local records and manual backups remain available.";
  }
}
