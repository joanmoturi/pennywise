/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { stageHandoff, MAX_HANDOFF_BYTES } from "./handoff";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname !== "/notification-handoff"
  )
    return;
  if (event.request.method !== "POST") return;
  event.respondWith(
    (async () => {
      try {
        const length = event.request.headers.get("content-length");
        if (length && Number(length) > MAX_HANDOFF_BYTES + 10_000)
          throw new Error("Too large");
        const form = await event.request.formData();
        const files = form.getAll("transactions");
        if (
          files.length !== 1 ||
          typeof files[0] === "string" ||
          files[0].size > MAX_HANDOFF_BYTES
        )
          throw new Error("One JSON file required");
        await stageHandoff(await files[0].text());
        return Response.redirect(
          new URL("/transaction-inbox/", self.location.origin).href,
          303,
        );
      } catch {
        // Never forward failed shares or their contents to hosting.
        return new Response(
          "Pennywise could not save this share locally. Keep the companion queue and retry using Transaction Inbox's file picker. No ledger records were changed.",
          {
            status: 400,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        );
      }
    })(),
  );
});
