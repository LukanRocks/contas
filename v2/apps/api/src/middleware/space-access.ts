import type { Role } from '@contas/contracts'
import { and, eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { spaceMembers } from '../db/schema.ts'
import { forbidden, notFound } from '../lib/errors.ts'
import { isUuid } from '../lib/ids.ts'
import type { AppEnv } from '../lib/router.ts'

/**
 * Resolves the space in the path to the acting user's membership of it.
 * A space the user is not a member of answers exactly like one that does not exist.
 */
export const spaceAccess = createMiddleware<AppEnv>(async (context, next) => {
  const spaceId = context.req.param('sid')

  if (!spaceId || !isUuid(spaceId)) throw notFound('No such space.')

  const [membership] = await context.var.db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, context.var.actor.id)))

  if (!membership) throw notFound('No such space.')

  context.set('space', { id: spaceId, role: membership.role })

  await next()
})

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 }

/** Route middleware: the acting user's role in the space must be at least `min`. */
export const requireRole = (min: Role) =>
  createMiddleware<AppEnv>(async (context, next) => {
    const { role } = context.var.space

    if (RANK[role] < RANK[min]) throw forbidden(`This needs the ${min} role; you are ${role === 'editor' ? 'an' : 'a'} ${role}.`)

    await next()
  })
