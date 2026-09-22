import type { CreateSpace, Role, Space, UpdateSpace } from '@contas/contracts'
import { eq, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { spaceMembers, spaces } from '../../db/schema.ts'
import { writeAudit } from '../../lib/audit.ts'
import { notFound } from '../../lib/errors.ts'
import { newId } from '../../lib/ids.ts'
import type { Actor, SpaceAccess } from '../../lib/router.ts'
import { memberEntityId, toMember } from '../members/service.ts'

type SpaceRow = typeof spaces.$inferSelect

export const toSpace = (row: SpaceRow, role: Role): Space => ({
  id: row.id,
  name: row.name,
  role,
  created_at: row.createdAt.toISOString(),
  updated_at: row.updatedAt.toISOString(),
})

/**
 * What the audit log keeps for a space.
 * `role` is left out: it describes whoever reads the space, not the space itself.
 */
const snapshot = (row: SpaceRow) => ({
  id: row.id,
  name: row.name,
  created_at: row.createdAt.toISOString(),
  updated_at: row.updatedAt.toISOString(),
})

/** Only the spaces the user belongs to, each with the user's role, by name. */
export async function listSpaces(db: Database, userId: string): Promise<Space[]> {
  const rows = await db
    .select({ space: spaces, role: spaceMembers.role })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(eq(spaceMembers.userId, userId))
    .orderBy(sql`lower(${spaces.name})`, spaces.id)

  return rows.map((row) => toSpace(row.space, row.role))
}

async function findSpace(db: Database, id: string, lock = false): Promise<SpaceRow> {
  const query = db.select().from(spaces).where(eq(spaces.id, id))
  const [row] = lock ? await query.for('update') : await query

  if (!row) throw notFound('No such space.')

  return row
}

export async function getSpace(db: Database, access: SpaceAccess): Promise<Space> {
  return toSpace(await findSpace(db, access.id), access.role)
}

/** The creator becomes the space's owner. Accounts only appear with the first managed account. */
export async function createSpace(tx: Database, input: CreateSpace, actor: Actor): Promise<Space> {
  const [row] = await tx.insert(spaces).values({ id: newId(), name: input.name }).returning()
  const space = row!
  const [membership] = await tx.insert(spaceMembers).values({ spaceId: space.id, userId: actor.id, role: 'owner' }).returning()

  await writeAudit(tx, { spaceId: space.id, entityType: 'space', entityId: space.id, action: 'create', before: null, after: snapshot(space), actor })
  await writeAudit(tx, {
    spaceId: space.id,
    entityType: 'space_member',
    entityId: memberEntityId(space.id, actor.id),
    action: 'create',
    before: null,
    after: toMember({ ...membership!, userName: actor.name }),
    actor,
  })

  return toSpace(space, 'owner')
}

export async function renameSpace(tx: Database, access: SpaceAccess, input: UpdateSpace, actor: Actor): Promise<Space> {
  const before = await findSpace(tx, access.id, true)
  const [row] = await tx.update(spaces).set({ name: input.name, updatedAt: new Date() }).where(eq(spaces.id, access.id)).returning()
  const after = row!

  await writeAudit(tx, {
    spaceId: access.id,
    entityType: 'space',
    entityId: access.id,
    action: 'update',
    before: snapshot(before),
    after: snapshot(after),
    actor,
  })

  return toSpace(after, access.role)
}

/**
 * Permanently deletes the space and, by cascade, its members, accounts, transactions and audit log.
 * Nothing is audited: nothing about the space remains afterwards.
 */
export async function deleteSpace(tx: Database, access: SpaceAccess): Promise<void> {
  await tx.delete(spaces).where(eq(spaces.id, access.id))
}
