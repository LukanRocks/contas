import { Scalar } from '@scalar/hono-api-reference'
import { HTTPException } from 'hono/http-exception'
import type { Database } from './db/client.ts'
import { env } from './env.ts'

import { AppError, badRequest, conflict, notFound, pgErrorCode, problemResponse, UNIQUE_VIOLATION } from './lib/errors.ts'
import { createRouter } from './lib/router.ts'

import { actingUser } from './middleware/acting-user.ts'
import { spaceAccess } from './middleware/space-access.ts'

import { accountRoutes } from './modules/accounts/routes.ts'
import { balanceRoutes } from './modules/balances/routes.ts'
import { currencyRoutes } from './modules/currencies/routes.ts'
import { healthRoutes } from './modules/health/routes.ts'
import { memberRoutes } from './modules/members/routes.ts'
import { spaceRoutes } from './modules/spaces/routes.ts'
import { transactionRoutes } from './modules/transactions/routes.ts'
import { userRoutes } from './modules/users/routes.ts'

/**
 * Assembles the whole API around a database handle.
 * The server passes its client.
 * Tests pass a transaction so every test rolls back.
 */
export function createApp({ db }: { db: Database }) {
  const app = createRouter()

  app.use(async (context, next) => {
    context.set('db', db)
    await next()
  })

  // Who is acting, then what they can see: every /v1/spaces/{sid}/... route runs both.
  app.use('/v1/*', actingUser)
  app.use('/v1/spaces/:sid/*', spaceAccess)

  app.route('/', healthRoutes)
  app.route('/', userRoutes)
  app.route('/', spaceRoutes)
  app.route('/', memberRoutes)
  app.route('/', currencyRoutes)
  app.route('/', accountRoutes)
  app.route('/', transactionRoutes)
  app.route('/', balanceRoutes)

  app.openAPIRegistry.registerComponent('securitySchemes', 'ActingUser', {
    type: 'apiKey',
    in: 'header',
    name: 'X-User-Id',
    description: 'The id of the acting user. Identification only, for a trusted network: nothing proves the caller is that user.',
  })

  app.doc31('/v1/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Contas API', version: env.version },
    security: [{ ActingUser: [] }],
  })

  app.get('/docs', Scalar({ url: '/v1/openapi.json', pageTitle: 'Contas API' }))

  app.notFound((context) => problemResponse(notFound(`No route for ${context.req.method} ${context.req.path}.`)))

  app.onError((err) => {
    if (err instanceof AppError) return problemResponse(err)
    // Raised by Hono's validators, e.g. for a body that is not valid JSON.
    if (err instanceof HTTPException && err.status === 400) return problemResponse(badRequest(err.message))
    // Services check uniqueness first, so this only catches a concurrent request winning the race.
    if (pgErrorCode(err) === UNIQUE_VIOLATION) return problemResponse(conflict('Conflicts with a record that was just created.'))

    console.error('[api] unhandled error:', err)

    return problemResponse(new AppError('internal_error'))
  })

  return app
}

export type App = ReturnType<typeof createApp>
