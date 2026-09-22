import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { users } from '../db/schema.ts'
import { unauthenticated } from '../lib/errors.ts'
import { isUuid } from '../lib/ids.ts'
import type { AppEnv } from '../lib/router.ts'

/** /v1 requests that need no X-User-Id. /health and /docs sit outside /v1, so this middleware never sees them. */
const OPEN = new Set(['GET /v1/openapi.json'])

/** /v1 requests where X-User-Id is optional: checked when sent, so the audit log can record who acted. */
const OPTIONAL = new Set(['POST /v1/users'])

/**
 * Resolves X-User-Id to the acting user.
 * This is identification, not authentication, and suits a trusted home network only.
 * Real auth later replaces this middleware and nothing else.
 */
export const actingUser = createMiddleware<AppEnv>(async (context, next) => {
  const request = `${context.req.method} ${context.req.path}`

  if (OPEN.has(request)) return next()

  const header = context.req.header('x-user-id')

  if (header === undefined && OPTIONAL.has(request)) return next()
  if (header === undefined) throw unauthenticated('Send X-User-Id with the id of the acting user.')
  if (!isUuid(header)) throw unauthenticated('X-User-Id is not a UUID.')

  const [user] = await context.var.db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, header))

  if (!user) throw unauthenticated('X-User-Id does not match any user.')

  context.set('actor', user)

  await next()
})
