import { serve } from '@hono/node-server'
import { existsSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { openDb } from './db.ts'

const PORT = Number(process.env['PORT'] ?? 3000)

// The database lives at the workspace root, beside the apps rather than inside
// one of them. Resolved from this file so it does not depend on the cwd.
const inDataDir = (name: string) => fileURLToPath(new URL(`../../data/${name}`, import.meta.url))

const DB_PATH_DEFAULT = inDataDir('contas.db')

// This project was called nf-price-tracker until the rename, and an install
// from before it keeps its notes under that name.
const DB_PATH_LEGACY = inDataDir('nf-price-tracker.db')

/**
 * Moves a pre-rename database to the current filename, once, and answers with
 * the path to open. A move that fails answers with the old path rather than
 * the new one: whatever else goes wrong, nobody comes up against an empty
 * database with their notes sitting right there under the other name.
 *
 * WAL is on (see db.ts), so the sidecars travel with the database. A clean
 * shutdown checkpoints and removes them, but a crashed one can leave committed
 * data in the `-wal`, and leaving that behind would lose it. A move that fails
 * partway is put back, so the set is never split across two names.
 */
function migrateLegacyDb(from: string, to: string): string {
  if (existsSync(to) || !existsSync(from)) return to

  const moved: string[] = []
  try {
    for (const suffix of ['', '-wal', '-shm']) {
      if (!existsSync(from + suffix)) continue
      renameSync(from + suffix, to + suffix)
      moved.push(suffix)
    }
    console.log(`[nfce] renamed ${from} to ${to}`)
    return to
  } catch (err) {
    // If putting it back fails too the database is genuinely split, and that
    // is worth crashing over rather than opening half of it.
    for (const suffix of moved) renameSync(to + suffix, from + suffix)
    console.warn(`[nfce] could not rename ${from} to ${to}; opening it where it is:`, err)
    return from
  }
}

// An explicit DATABASE_PATH is taken literally: no migration, no fallback.
const DB_PATH = process.env['DATABASE_PATH'] ?? migrateLegacyDb(DB_PATH_LEGACY, DB_PATH_DEFAULT)

const db = openDb(DB_PATH)
const app = createApp(db)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[nfce] listening on http://localhost:${info.port} (db: ${DB_PATH})`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    db.close()
    process.exit(0)
  })
}
