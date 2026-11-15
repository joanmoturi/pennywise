import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { onRequestGet } from "./functions/api/bond-reference";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const project =
    process.env.VITE_FIREBASE_PROJECT_ID ?? env.VITE_FIREBASE_PROJECT_ID;
  if (project && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project))
    throw new Error("Use a valid Firebase project ID");
  const syncOrigin = project ? `https://${project}.firebaseapp.com` : "";
  const syncCsp = (text: string) =>
    text.replaceAll("__PENNYWISE_SYNC_AUTH_ORIGIN__", syncOrigin);
  const nonce =
    command === "serve" ? randomBytes(16).toString("base64") : undefined;
  return {
    base: "/",
    server: {
      watch: { ignored: ["**/playwright-report/**", "**/test-results/**"] },
    },
    html: { cspNonce: nonce },
    plugins: [
      react(),
      {
        name: "optional-sync-csp",
        transformIndexHtml: { order: "pre", handler: syncCsp },
        async closeBundle() {
          if (command === "build")
            await writeFile(
              "dist/_headers",
              syncCsp(await readFile("public/_headers", "utf8")),
            );
        },
      },
      {
        name: "official-public-bond-adapter",
        configureServer(server) {
          server.middlewares.use(
            "/api/bond-reference",
            async (request, response) => {
              if (request.method !== "GET") {
                response.statusCode = 405;
                response.end();
                return;
              }
              const result = await onRequestGet();
              response.statusCode = result.status;
              result.headers.forEach((value, key) =>
                response.setHeader(key, value),
              );
              response.end(await result.text());
            },
          );
        },
      },
      {
        name: "local-development-csp",
        apply: "serve",
        transformIndexHtml: {
          order: "post",
          handler(html) {
            return html.replace(
              "script-src 'self'",
              `script-src 'self' 'nonce-${nonce}'`,
            );
          },
        },
      },
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        registerType: "prompt",
        includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
        manifest: {
          id: "/",
          name: "Pennywise Financial Command Centre",
          short_name: "Pennywise",
          description: "Private, offline-first personal finance",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#0b1220",
          theme_color: "#0b1220",
          lang: "en-KE",
          share_target: {
            action: "/notification-handoff",
            method: "POST",
            enctype: "multipart/form-data",
            params: {
              files: [
                { name: "transactions", accept: ["application/json", ".json"] },
              ],
            },
          },
          icons: [
            {
              src: "/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
    ],
  };
});
