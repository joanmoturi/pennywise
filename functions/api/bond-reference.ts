const OFFICIAL_LISTING =
  "https://www.centralbank.go.ke/bills-bonds/treasury-bonds/";

// Fixed public upstream: never accept a user-supplied URL, credentials or body.
export async function onRequestGet(): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const unavailable = (sourceStatus: string) =>
    new Response(
      "Official bond source unavailable. Dated reference snapshots and manual entry remain available.",
      {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Pennywise-CBK-Status": sourceStatus,
        },
      },
    );
  try {
    const upstream = await fetch(OFFICIAL_LISTING, {
      headers: { Accept: "text/html" },
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (!upstream.ok) return unavailable(String(upstream.status));
    const text = await upstream.text();
    if (text.length > 5_000_000)
      throw new Error("Official listing exceeds limit");
    return new Response(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return unavailable(controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timeout);
  }
}
