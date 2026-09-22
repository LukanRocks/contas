import { createApp } from './app.ts'
import { createDb } from './db/client.ts'
import { env, requireEnv } from './env.ts'

const { db, sql } = createDb(requireEnv('DATABASE_URL'))
const app = createApp({ db })

const server = Bun.serve({ port: env.PORT, fetch: app.fetch })

console.log(`[api] ${env.version} listening on http://localhost:${server.port} (docs at /docs)`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.stop()
    await sql.end({ timeout: 5 })

    process.exit(0)
  })
}
