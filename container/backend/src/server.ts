import { serve } from '@hono/node-server'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { openDb } from './db.ts'

const PORT = Number(process.env['PORT'] ?? 3000)

// The database lives at the workspace root, beside the apps rather than inside
// one of them. Resolved from this file so it does not depend on the cwd.
const DB_PATH =
  process.env['DATABASE_PATH'] ??
  fileURLToPath(new URL('../../data/nf-price-tracker.db', import.meta.url))

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
