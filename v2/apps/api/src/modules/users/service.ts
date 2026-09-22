import type { CreateUser, UpdateUser, User } from '@contas/contracts'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { spaceMembers, spaces, users } from '../../db/schema.ts'
import { writeAudit } from '../../lib/audit.ts'
import { conflict, notFound } from '../../lib/errors.ts'
import { newId } from '../../lib/ids.ts'
import type { Actor } from '../../lib/router.ts'
import { memberColumns, memberEntityId, toMember } from '../members/service.ts'

type UserRow = typeof users.$inferSelect

export const toUser = (row: UserRow): User => ({
  id: row.id,
  name: row.name,
  created_at: row.createdAt.toISOString(),
  updated_at: row.updatedAt.toISOString(),
})

/** Every user, by name. Users are global: any acting user sees all of them. */
export async function listUsers(db: Database): Promise<User[]> {
  const rows = await db.select().from(users).orderBy(sql`lower(${users.name})`, users.id)

  return rows.map(toUser)
}

export async function getUser(db: Database, id: string): Promise<User> {
  const [row] = await db.select().from(users).where(eq(users.id, id))

  if (!row) throw notFound('No such user.')

  return toUser(row)
}

async function lockUser(tx: Database, id: string): Promise<UserRow> {
  const [row] = await tx.select().from(users).where(eq(users.id, id)).for('update')

  if (!row) throw notFound('No such user.')

  return row
}

/** `actor` is null when the request came without X-User-Id, which only this endpoint allows. */
export async function createUser(tx: Database, input: CreateUser, actor: Actor | null): Promise<User> {
  const [row] = await tx.insert(users).values({ id: newId(), name: input.name }).returning()
  const user = toUser(row!)

  await writeAudit(tx, { spaceId: null, entityType: 'user', entityId: user.id, action: 'create', before: null, after: user, actor })

  return user
}

export async function renameUser(tx: Database, id: string, input: UpdateUser, actor: Actor): Promise<User> {
  const before = toUser(await lockUser(tx, id))
  const [row] = await tx.update(users).set({ name: input.name, updatedAt: new Date() }).where(eq(users.id, id)).returning()
  const after = toUser(row!)

  await writeAudit(tx, { spaceId: null, entityType: 'user', entityId: id, action: 'update', before, after, actor })

  return after
}

/**
 * Refused while the user is the only owner of any space.
 * Otherwise their memberships go first, each audited in its own space, then the user.
 * The user's own audit rows keep actor_id and actor_name, and transactions they created keep existing with created_by set to NULL.
 */
export async function deleteUser(tx: Database, id: string, actor: Actor): Promise<void> {
  const user = toUser(await lockUser(tx, id))
  const memberships = await tx
    .select(memberColumns)
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(eq(spaceMembers.userId, id))
    .for('update', { of: spaceMembers })

  const owned = memberships.filter((membership) => membership.role === 'owner').map((membership) => membership.spaceId)

  if (owned.length > 0) {
    // Lock the other owners too, so none of them can step down while this check holds.
    const coOwners = await tx
      .select({ spaceId: spaceMembers.spaceId })
      .from(spaceMembers)
      .where(and(inArray(spaceMembers.spaceId, owned), eq(spaceMembers.role, 'owner'), ne(spaceMembers.userId, id)))
      .for('update')
    const covered = new Set(coOwners.map((coOwner) => coOwner.spaceId))
    const soleOwnerOf = owned.filter((spaceId) => !covered.has(spaceId))

    if (soleOwnerOf.length > 0) {
      const names = await tx.select({ name: spaces.name }).from(spaces).where(inArray(spaces.id, soleOwnerOf)).orderBy(spaces.name)

      throw conflict(`${user.name} is the only owner of ${names.map((space) => `"${space.name}"`).join(', ')}. Make someone else an owner, or delete the space, first.`)
    }
  }

  for (const membership of memberships) {
    await writeAudit(tx, {
      spaceId: membership.spaceId,
      entityType: 'space_member',
      entityId: memberEntityId(membership.spaceId, id),
      action: 'delete',
      before: toMember(membership),
      after: null,
      actor,
    })
  }

  await tx.delete(spaceMembers).where(eq(spaceMembers.userId, id))
  await writeAudit(tx, { spaceId: null, entityType: 'user', entityId: id, action: 'delete', before: user, after: null, actor })
  await tx.delete(users).where(eq(users.id, id))
}
