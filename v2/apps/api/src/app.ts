import { Scalar } from '@scalar/hono-api-reference'
import { HTTPException } from 'hono/http-exception'
import type { Database } from './db/client.ts'
import { env } from './env.ts'
import { AppError, badRequest, notFound, problemResponse } from './lib/errors.ts'
import { createRouter } from './lib/router.ts'
import { healthRoutes } from './modules/health/routes.ts'

/**
 * Assembles the whole API around a database handle.
 * The server passes its client.
 * Tests pass a transaction so every test rolls back.
 */
export function createApp({ db }: { db: Database }) {
  const app = createRouter()

  app.use(async (c, next) => {
    c.set('db', db)
    await next()
  })

  app.route('/', healthRoutes)

  app.doc31('/v1/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Contas API', version: env.version },
  })

  app.get('/docs', Scalar({ url: '/v1/openapi.json', pageTitle: 'Contas API' }))

  app.notFound((c) => problemResponse(notFound(`No route for ${c.req.method} ${c.req.path}.`)))

  app.onError((err) => {
    if (err instanceof AppError) return problemResponse(err)
    // Raised by Hono's validators, e.g. for a body that is not valid JSON.
    if (err instanceof HTTPException && err.status === 400) return problemResponse(badRequest(err.message))

    console.error('[api] unhandled error:', err)

    return problemResponse(new AppError('internal_error'))
  })

  return app
}

export type App = ReturnType<typeof createApp>
