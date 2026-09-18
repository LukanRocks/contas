import type { NoteListResponse } from "./types";

/** Long enough for a sleepy homelab box, short enough to not feel hung. */
const TIMEOUT_MS = 10_000;

/** Every failure the screens show the user arrives as one of these. */
export class ApiError extends Error {
  override name = "ApiError";
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
  if (!trimmed) throw new ApiError("Informe o endereço do servidor.");

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const withScheme = hasScheme ? trimmed : `${looksLocal(trimmed) ? "http" : "https"}://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ApiError("Endereço inválido. Exemplo: 192.168.1.10:3000");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError("O endereço precisa começar com http:// ou https://");
  }
  if (!url.hostname) {
    throw new ApiError("Endereço inválido. Exemplo: 192.168.1.10:3000");
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
    const message = isRecord(body) && typeof body["message"] === "string" ? body["message"] : "";
    throw new ApiError(
      `O servidor respondeu, mas não está saudável${message ? `: ${message}` : "."}`,
    );
  }

  throw new ApiError("Esse endereço respondeu, mas não parece ser um servidor nf-price-tracker.");
}

/** Notes for the home screen, newest emission first — same order as the web list. */
export async function listNotes(baseUrl: string, limit = 200): Promise<NoteListResponse> {
  const body = await getJson(`${baseUrl}/api/nfce?limit=${limit}`, { expectedStatuses: [200] });

  if (!isRecord(body) || !Array.isArray(body["notes"])) {
    throw new ApiError("Resposta inesperada do servidor ao listar as notas.");
  }
  return body as NoteListResponse;
}

type GetOptions = {
  /** Statuses whose JSON body is meaningful; anything else is reported as a failure. */
  expectedStatuses: number[];
};

async function getJson(url: string, { expectedStatuses }: GetOptions): Promise<unknown> {
  // React Native's fetch has no `AbortSignal.timeout`, so the timer is manual.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ApiError(`O servidor não respondeu em ${TIMEOUT_MS / 1000}s.`);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(
      `Não foi possível falar com o servidor. Confira o endereço e se o aparelho está na mesma rede (${message}).`,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // A login portal or a reverse proxy answering HTML — not our API.
    if (res.ok) {
      throw new ApiError("Esse endereço respondeu, mas não parece ser um servidor nf-price-tracker.");
    }
  }

  if (!expectedStatuses.includes(res.status)) {
    const detail =
      (isRecord(body) && (asString(body["message"]) ?? asString(body["error"]))) ||
      text.slice(0, 120) ||
      "sem detalhes";
    throw new ApiError(`O servidor respondeu ${res.status} — ${detail}`);
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
