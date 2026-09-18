export class FetchError extends Error {}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

const TIMEOUT_MS = 30_000;

/** Charset from a Content-Type header, defaulting to utf-8. */
function charsetOf(contentType: string | null): string {
  const m = /charset=\s*"?([\w-]+)"?/i.exec(contentType ?? "");
  return (m?.[1] ?? "utf-8").toLowerCase();
}

/**
 * Fetch a scanned QR URL verbatim -- it already carries the right domain and
 * any signed parameters, so we never rebuild it from the chave.
 */
export async function fetchNoteHtml(url: string): Promise<{ html: string; fetched_at: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new FetchError(`could not reach ${url}: ${reason}`);
  }

  if (!res.ok) {
    throw new FetchError(`portal returned HTTP ${res.status} ${res.statusText} for ${url}`);
  }

  // Decode using the charset the portal declares; undici's .text() would assume
  // UTF-8 and mangle the accents on portals that still serve latin-1.
  const buf = await res.arrayBuffer();
  let html: string;
  try {
    html = new TextDecoder(charsetOf(res.headers.get("content-type"))).decode(buf);
  } catch {
    html = new TextDecoder("utf-8").decode(buf);
  }

  if (html.trim() === "") throw new FetchError(`portal returned an empty body for ${url}`);

  return { html, fetched_at: new Date().toISOString() };
}
