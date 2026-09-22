import { Health } from '@contas/contracts'
import { createRoute } from '@hono/zod-openapi'
import { sql } from 'drizzle-orm'
import { env } from '../../env.ts'
import { createRouter } from '../../lib/router.ts'

const route = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Liveness, including a round trip to Postgres',
  responses: {
    200: { description: 'Postgres answered', content: { 'application/json': { schema: Health } } },
    503: { description: 'Postgres did not answer', content: { 'application/json': { schema: Health } } },
  },
})

export const healthRoutes = createRouter().openapi(route, async (c) => {
  try {
    await c.var.db.execute(sql`SELECT 1`)
    return c.json({ status: 'ok' as const, version: env.version }, 200)
  } catch (err) {
    console.error('[health] database check failed:', err instanceof Error ? err.message : err)
    return c.json({ status: 'error' as const, version: env.version }, 503)
  }
})
