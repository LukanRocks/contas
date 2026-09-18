import type { Strings } from "./i18n/strings";
import type { IngestPayload } from "./scan";
import type { NoteListResponse, ParsedNote } from "./types";

/** Long enough for a sleepy homelab box, short enough to not feel hung. */
const TIMEOUT_MS = 10_000;

/**
 * Ingesting is not a local read: the server fetches the note from its state
 * portal and parses it, and those portals are slow. Failing at ten seconds
 * would abandon requests that were about to succeed.
 */
const INGEST_TIMEOUT_MS = 45_000;

/**
 * Every failure the screens show the user arrives as one of these. It carries
 * how to say itself rather than the words: what is thrown here may be rendered
 * in either language, and the language can change between the two moments.
 */
export class ApiError extends Error {
  override name = "ApiError";

  /** The failure in the language in force where it is shown. */
  readonly describe: (t: Strings) => string;

  constructor(describe: (t: Strings) => string) {
    // `message` stays a bare marker: the readable text is `describe(t)`, and
    // resolving it here would mean this module holding a copy of the words --
    // in one language, chosen before anyone knows which one is in force.
    super("ApiError");
    this.describe = describe;
  }
}

/**
 * Accepts what someone would actually type on a phone keyboard:
 * `192.168.1.10:3000`, `nf.local`, `https://nf.example.com/api/`. Returns the
 * origin with no trailing slash, ready to have `/api/...` appended.
 *
 * A missing scheme is filled in by where the host lives: a bare IP, a port, or
 * a `.local`/`localhost` name is a server on the user's own network, which is
 * almost never behind TLS. Anything else is a public name, which almost always
 * is.
 */
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new ApiError((t) => t.errors.addressRequired);

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const withScheme = hasScheme ? trimmed : `${looksLocal(trimmed) ? "http" : "https"}://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ApiError((t) => t.errors.addressInvalid);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError((t) => t.errors.addressScheme);
  }
  if (!url.hostname) {
    throw new ApiError((t) => t.errors.addressInvalid);
  }

  // Pasting the API root instead of the origin is an easy mistake to make, and
  // an easy one to undo: `/api` is appended by this module, never by the user.
  const path = url.pathname.replace(/\/+$/, "").replace(/\/api$/i, "");
  return `${url.origin}${path}`;
}

function looksLocal(host: string): boolean {
  const name = host.split("/")[0]?.split(":")[0]?.toLowerCase() ?? "";
  return (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(name) ||
    name === "localhost" ||
    name.endsWith(".local") ||
    name.endsWith(".lan") ||
    /:\d+$/.test(host.split("/")[0] ?? "")
  );
}

/**
 * Confirms the address is a nf-price-tracker backend before anything is stored.
 * `/api/health` also pings SQLite, so a reachable-but-broken server is told
 * apart from a healthy one here rather than at the first list load.
 */
export async function checkBackend(baseUrl: string): Promise<void> {
  const body = await getJson(`${baseUrl}/api/health`, { expectedStatuses: [200, 503] });

  const status = isRecord(body) ? body["status"] : undefined;
  if (status === "ok") return;

  if (status === "error") {
    const detail = isRecord(body) ? asString(body["message"]) : null;
    throw new ApiError((t) => t.errors.unhealthy(detail));
  }

  throw new ApiError((t) => t.errors.notOurBackend);
}

/** Notes for the home screen, newest emission first — same order as the web list. */
export async function listNotes(baseUrl: string, limit = 200): Promise<NoteListResponse> {
  const body = await getJson(`${baseUrl}/api/nfce?limit=${limit}`, { expectedStatuses: [200] });

  if (!isRecord(body) || !Array.isArray(body["notes"])) {
    throw new ApiError((t) => t.errors.unexpectedList);
  }
  return body as NoteListResponse;
}

/**
 * Hands a scanned note to the server, which fetches it from the state portal,
 * parses it and stores it. The write is idempotent on the chave, so scanning
 * the same note twice updates the stored copy rather than duplicating it.
 *
 * Returns the parsed note, which is what the screen shows as confirmation.
 */
export async function ingestNote(baseUrl: string, payload: IngestPayload): Promise<ParsedNote> {
  const { status, body } = await send(`${baseUrl}/api/nfce`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: INGEST_TIMEOUT_MS,
  });

  if (status !== 200) throw new ApiError(ingestFailure(status, body));

  if (!isRecord(body) || typeof body["chave"] !== "string") {
    throw new ApiError((t) => t.errors.noteMissing);
  }
  return body as unknown as ParsedNote;
}

/**
 * The ingest endpoint names what went wrong; these are those names said in a
 * way that means something to someone holding a receipt.
 */
function ingestFailure(status: number, body: unknown): (t: Strings) => string {
  const code = isRecord(body) ? asString(body["error"]) : null;
  const uf = isRecord(body) ? asString(body["uf"]) : null;

  switch (code) {
    case "invalid_chave":
    case "invalid_body":
      return (t) => t.errors.notANote;
    case "unsupported_uf":
      return (t) => t.errors.unsupportedUf(uf ?? "?");
    case "fetch_failed":
      return (t) => t.errors.fetchFailed;
    case "parse_failed":
      return (t) => t.errors.parseFailed;
    case "store_failed":
      return (t) => t.errors.storeFailed;
    default: {
      const detail = isRecord(body) ? (asString(body["message"]) ?? code) : null;
      return (t) => t.errors.serverSaid(status, detail);
    }
  }
}

type GetOptions = {
  /** Statuses whose JSON body is meaningful; anything else is reported as a failure. */
  expectedStatuses: number[];
};

async function getJson(url: string, { expectedStatuses }: GetOptions): Promise<unknown> {
  const { status, body, text } = await send(url, {
    method: "GET",
    headers: { accept: "application/json" },
    timeoutMs: TIMEOUT_MS,
  });

  if (!expectedStatuses.includes(status)) {
    const detail =
      (isRecord(body) && (asString(body["message"]) ?? asString(body["error"]))) ||
      text.slice(0, 120) ||
      null;
    throw new ApiError((t) => t.errors.serverSaid(status, detail));
  }

  return body;
}

type SendOptions = {
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
};

/**
 * One request, with the network failures already turned into sentences. The
 * status comes back untouched: what an unexpected one means is the caller's to
 * say, and the ingest endpoint says a great deal more with it than a read does.
 */
async function send(
  url: string,
  { method, headers, body: requestBody, timeoutMs }: SendOptions,
): Promise<{ status: number; body: unknown; text: string }> {
  // React Native's fetch has no `AbortSignal.timeout`, so the timer is manual.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(requestBody === undefined ? {} : { body: requestBody }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ApiError((t) => t.errors.timeout(timeoutMs / 1000));
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new ApiError((t) => t.errors.unreachable(detail));
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // A login portal or a reverse proxy answering HTML — not our API.
    if (res.ok) throw new ApiError((t) => t.errors.notOurBackend);
  }

  return { status: res.status, body: parsed, text };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
