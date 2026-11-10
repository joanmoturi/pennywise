const OFFICIAL_LISTING =
  "https://www.centralbank.go.ke/bills-bonds/treasury-bonds/";

// Fixed public upstream: never accept a user-supplied URL, credentials or body.
export async function onRequestGet(): Promise<Response> {
  try {
    const upstream = await fetch(OFFICIAL_LISTING, {
      headers: { Accept: "text/html" },
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) throw new Error("Official source unavailable");
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
    return new Response(
      "Official bond source unavailable. Manual entry remains available.",
      { status: 503 },
    );
  }
}
