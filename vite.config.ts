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
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        registerType: "prompt",
        includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
        manifest: {
          id: "/",
          name: "Kichella Financial Command Centre",
          short_name: "Kichella",
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
