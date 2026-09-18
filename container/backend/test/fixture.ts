import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Tests never ship a real note: a scanned NFC-e is someone's shopping, and
 * carries their CPF. Point NFCE_FIXTURE at a page you captured yourself and the
 * parser/ingest tests run against it; leave it unset and they skip.
 *
 * Relative paths resolve from the workspace root, so `data/nfce-fixture.html`
 * lands in the gitignored `data/` directory.
 */
const WORKSPACE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const configured = process.env["NFCE_FIXTURE"]?.trim();

function load(): string | null {
  if (!configured) return null;
  const path = isAbsolute(configured) ? configured : resolve(WORKSPACE_ROOT, configured);
  if (!existsSync(path)) {
    // Misconfiguration is louder than a silent skip: the user asked for these.
    throw new Error(
      `NFCE_FIXTURE points at "${path}", which does not exist.\n` +
        `Capture one with: pnpm --filter @nf-price-tracker/backend fixture:capture <qr-url>`,
    );
  }
  const html = readFileSync(path, "utf8");
  if (html.trim() === "") throw new Error(`NFCE_FIXTURE file "${path}" is empty.`);
  return html;
}

export const fixtureHtml: string | null = load();

/** Pass as node:test's `skip` option — false runs, a string skips with a reason. */
export const skipWithoutFixture: false | string = fixtureHtml
  ? false
  : "set NFCE_FIXTURE to a captured NFC-e page (see backend/README.md)";

/** Only call inside a test guarded by `skipWithoutFixture`. */
export function html(): string {
  if (!fixtureHtml) throw new Error("no fixture configured");
  return fixtureHtml;
}
