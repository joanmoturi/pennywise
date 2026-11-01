import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { randomBytes } from "node:crypto";

export default defineConfig(({ command }) => {
  const nonce =
    command === "serve" ? randomBytes(16).toString("base64") : undefined;
  return {
    base: "/",
    html: { cspNonce: nonce },
    plugins: [
      react(),
      {
        name: "local-development-csp",
        apply: "serve",
        transformIndexHtml: {
          order: "post",
          handler(html) {
            return html.replace(
              "script-src 'self';",
              `script-src 'self' 'nonce-${nonce}';`,
            );
          },
        },
      },
      VitePWA({
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
          background_color: "#0b2130",
          theme_color: "#0b2130",
          lang: "en-KE",
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
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
          navigateFallback: "index.html",
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
    ],
  };
});
