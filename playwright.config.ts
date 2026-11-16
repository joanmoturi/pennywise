import { defineConfig, devices } from "@playwright/test";

const googleClientId =
  process.env.VITE_GOOGLE_CLIENT_ID ??
  "synthetic-e2e.apps.googleusercontent.com";
const firebaseEnv = {
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY ?? "",
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID ?? "",
  VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID ?? "",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 120000,
  expect: { timeout: 10000 },
  workers: 1,
  metadata: {
    googleConfigured: Boolean(googleClientId),
    syncConfigured: Object.values(firebaseEnv).every(Boolean),
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4179",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port 4179 --strictPort",
    env: { VITE_GOOGLE_CLIENT_ID: googleClientId, ...firebaseEnv },
    url: "http://127.0.0.1:4179",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
