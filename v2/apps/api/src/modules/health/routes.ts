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
  security: [],
  responses: {
    200: { description: 'Postgres answered', content: { 'application/json': { schema: Health } } },
    503: { description: 'Postgres did not answer', content: { 'application/json': { schema: Health } } },
  },
})

export const healthRoutes = createRouter().openapi(route, async (context) => {
  try {
    await context.var.db.execute(sql`SELECT 1`)
    return context.json({ status: 'ok' as const, version: env.version }, 200)
  } catch (err) {
    console.error('[health] database check failed:', err instanceof Error ? err.message : err)
    return context.json({ status: 'error' as const, version: env.version }, 503)
  }
})
