import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import {
  extractChaveFromUrl,
  InvalidChaveError,
  normalizeChave,
  ufFromChave,
} from "./chave.ts";
import { crossCheckAgainstChave } from "./crosscheck.ts";
import { countNotes, getNote, getNoteHtml, listNotes, upsertNote, type DB } from "./db.ts";
import { fetchNoteHtml, FetchError } from "./fetcher.ts";
import {
  consultaUrl,
  isSupportedUf,
  parse,
  ParseError,
  UnsupportedUfError,
} from "./parsers/index.ts";

/**
 * A note is identified either by the URL its QR code encodes, or by the chave
 * on its own -- the form you can copy out of the Nota Paraná account, where
 * the note's own page is behind a login the server cannot follow.
 *
 * The chave is accepted as printed, in groups of four.
 */
const IngestBody = z.union([
  z.object({
    url: z
      .string()
      .url()
      .refine((u) => /^https?:$/.test(new URL(u).protocol), "url must be http(s)"),
  }),
  z.object({
    // Digits and the separators a receipt prints, so a pasted URL cannot be
    // mistaken for a key by stripping its non-digits.
    chave: z.string().regex(/^[\d\s.-]+$/, "chave must be digits, optionally grouped"),
  }),
]);

const ChaveParam = z.string().regex(/^\d{44}$/, "chave must be 44 digits");

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * The front end is served from this same origin, so there is no CORS to
 * configure. Resolved from this file rather than the cwd so it works however
 * the server is launched.
 */
const WEB_ROOT =
  process.env["WEB_ROOT"] ?? fileURLToPath(new URL("../../web/public/", import.meta.url));

export function createApp(db: DB) {
  const app = new Hono();
  const api = new Hono();

  // Liveness for container healthchecks: also pings SQLite, so a wedged or
  // unwritable database fails the check instead of reporting a healthy process.
  api.get("/health", (c) => {
    try {
      db.prepare("SELECT 1").get();
      return c.json({ status: "ok" }, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ status: "error", message }, 503);
    }
  });

  // Optional convenience for local testing: a QR URL the web app offers as a
  // one-click example. Unset in a fresh clone -- a real note identifies a real
  // person, so it is never committed.
  api.get("/config", (c) =>
    c.json({ sampleUrl: process.env["NFCE_SAMPLE_URL"]?.trim() || null }, 200),
  );

  api.get("/nfce", (c) => {
    const query = ListQuery.safeParse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });
    if (!query.success) {
      return c.json({ error: "invalid_query", issues: query.error.issues }, 400);
    }
    const { limit, offset } = query.data;
    return c.json({ total: countNotes(db), limit, offset, notes: listNotes(db, limit, offset) }, 200);
  });

  api.post("/nfce", async (c) => {
    // 1. Validate the body and resolve it to a chave.
    let chave: string;
    let scannedUrl: string | null = null;
    try {
      const body = IngestBody.parse(await c.req.json());
      if ("url" in body) {
        scannedUrl = body.url;
        chave = extractChaveFromUrl(body.url);
      } else {
        chave = normalizeChave(body.chave);
      }
    } catch (err) {
      if (err instanceof InvalidChaveError) {
        return c.json({ error: "invalid_chave", message: err.message }, 400);
      }
      if (err instanceof z.ZodError) {
        return c.json({ error: "invalid_body", issues: err.issues }, 400);
      }
      return c.json(
        { error: "invalid_body", message: "expected JSON body { url } or { chave }" },
        400,
      );
    }

    // 2. Route by UF before touching the network -- unsupported states store nothing.
    const uf = ufFromChave(chave);
    if (!isSupportedUf(uf)) {
      const err = new UnsupportedUfError(uf);
      return c.json({ error: "unsupported_uf", uf, message: err.message }, 422);
    }

    // 3-4. A scanned URL is fetched verbatim -- it carries the right domain and
    // any signed parameters. A bare chave has no URL, so build the
    // public lookup one for its state.
    const targetUrl = scannedUrl ?? consultaUrl(uf, chave);

    let html: string;
    let fetched_at: string;
    try {
      ({ html, fetched_at } = await fetchNoteHtml(targetUrl));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[nfce] fetch failed for ${chave}: ${message}`);
      return c.json({ error: "fetch_failed", message }, 502);
    }

    let note;
    try {
      note = parse(html, uf);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[nfce] parse failed for ${chave}: ${message}`);
      return c.json({ error: "parse_failed", message }, 502);
    }

    // The page's own chave wins, but disagreeing with what we asked for is
    // worth flagging -- it would mean the portal served a different note.
    if (note.chave !== chave) {
      console.warn(`[nfce] chave mismatch: requested ${chave}, page says ${note.chave}`);
    }

    // 5. Cross-check the scrape against the chave's encoded fields.
    for (const warning of crossCheckAgainstChave(note)) {
      console.warn(`[nfce] cross-check ${note.chave} -- ${warning}`);
    }

    // 6. Idempotent write.
    try {
      upsertNote(db, { ...note, source_url: targetUrl, raw_html: html, fetched_at });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[nfce] store failed for ${note.chave}: ${message}`);
      return c.json({ error: "store_failed", message }, 500);
    }

    // 7. Log the parsed object.
    console.log("[nfce] ingested:", JSON.stringify(note, null, 2));

    // 8. Return the parsed note.
    return c.json(note, 200);
  });

  api.get("/nfce/:chave", (c) => {
    const parsedParam = ChaveParam.safeParse(c.req.param("chave").replace(/\D/g, ""));
    if (!parsedParam.success) {
      return c.json({ error: "invalid_chave", message: "chave must be 44 digits" }, 400);
    }

    const note = getNote(db, parsedParam.data);
    if (!note) return c.json({ error: "not_found", chave: parsedParam.data }, 404);

    // raw_html is stored in full but omitted here so the response stays readable;
    // its size is reported instead. Query it from SQLite when you need the markup.
    const { raw_html, ...rest } = note;
    return c.json({ ...rest, raw_html_bytes: Buffer.byteLength(raw_html, "utf8") }, 200);
  });

  api.get("/nfce/:chave/html", (c) => {
    const parsedParam = ChaveParam.safeParse(c.req.param("chave").replace(/\D/g, ""));
    if (!parsedParam.success) {
      return c.json({ error: "invalid_chave", message: "chave must be 44 digits" }, 400);
    }

    const raw = getNoteHtml(db, parsedParam.data);
    if (raw === null) return c.json({ error: "not_found", chave: parsedParam.data }, 404);

    // This markup was scraped from a third-party portal. It is served for
    // display only: `sandbox` drops it into an opaque origin with scripts and
    // forms disabled, so it can never run against our own origin -- which
    // matters because the API now shares that origin.
    return c.body(raw, 200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "sandbox",
      "x-content-type-options": "nosniff",
    });
  });

  // Unknown /api paths answer in JSON rather than falling through to the shell.
  api.all("/*", (c) => c.json({ error: "not_found", path: c.req.path }, 404));

  app.route("/api", api);

  // Everything else is the front end: plain files, no build step. Revalidate on
  // every request so edits show up on reload instead of being served from cache.
  app.use(
    "/*",
    serveStatic({
      root: WEB_ROOT,
      onFound: (_path, c) => c.header("cache-control", "no-cache"),
    }),
  );

  return app;
}
