import type { AddMember, Member, Role, UpdateMember } from '@contas/contracts'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { spaceMembers, users } from '../../db/schema.ts'
import { writeAudit } from '../../lib/audit.ts'
import { conflict, notFound, pgErrorCode, UNIQUE_VIOLATION, validationError } from '../../lib/errors.ts'
import type { Actor } from '../../lib/router.ts'

type MemberRow = { spaceId: string; userId: string; userName: string; role: Role; createdAt: Date }

export const toMember = (row: MemberRow): Member => ({
  user_id: row.userId,
  user_name: row.userName,
  role: row.role,
  created_at: row.createdAt.toISOString(),
})

/** Memberships are audited under "space_id:user_id". */
export const memberEntityId = (spaceId: string, userId: string) => `${spaceId}:${userId}`

/** A membership joined to its user's current name: what `toMember` reads. */
export const memberColumns = {
  spaceId: spaceMembers.spaceId,
  userId: spaceMembers.userId,
  userName: users.name,
  role: spaceMembers.role,
  createdAt: spaceMembers.createdAt,
}

const memberQuery = (db: Database) => db.select(memberColumns).from(spaceMembers).innerJoin(users, eq(users.id, spaceMembers.userId))

export async function listMembers(db: Database, spaceId: string): Promise<Member[]> {
  const rows = await memberQuery(db).where(eq(spaceMembers.spaceId, spaceId)).orderBy(sql`lower(${users.name})`, users.id)

  return rows.map(toMember)
}

/** The membership row, locked for the rest of the transaction. */
async function lockMember(tx: Database, spaceId: string, userId: string): Promise<MemberRow> {
  const [row] = await memberQuery(tx)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .for('update', { of: spaceMembers })

  if (!row) throw notFound('That user is not a member of this space.')

  return row
}

/**
 * A space must always keep at least one owner.
 * Locks every owner row of the space first, so two owners demoting or removing each other at the same time cannot both succeed.
 */
export async function assertAnotherOwner(tx: Database, spaceId: string, leavingUserId: string): Promise<void> {
  const others = await tx
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.role, 'owner'), ne(spaceMembers.userId, leavingUserId)))
    .for('update')

  if (others.length === 0) throw conflict('A space must keep at least one owner. Make someone else an owner first.')
}

export async function addMember(tx: Database, spaceId: string, input: AddMember, actor: Actor): Promise<Member> {
  const [user] = await tx.select({ name: users.name }).from(users).where(eq(users.id, input.user_id))

  if (!user) throw validationError('No user has this id.', [{ path: 'user_id', message: 'No user has this id.' }])

  const inserted = await tx
    .insert(spaceMembers)
    .values({ spaceId, userId: input.user_id, role: input.role })
    .returning()
    .catch((err: unknown) => {
      if (pgErrorCode(err) === UNIQUE_VIOLATION) throw conflict(`${user.name} is already a member of this space.`)
      throw err
    })
  const member = toMember({ ...inserted[0]!, userName: user.name })

  await writeAudit(tx, {
    spaceId,
    entityType: 'space_member',
    entityId: memberEntityId(spaceId, input.user_id),
    action: 'create',
    before: null,
    after: member,
    actor,
  })

  return member
}

export async function updateMemberRole(tx: Database, spaceId: string, userId: string, input: UpdateMember, actor: Actor): Promise<Member> {
  const row = await lockMember(tx, spaceId, userId)

  if (row.role === 'owner' && input.role !== 'owner') await assertAnotherOwner(tx, spaceId, userId)

  await tx
    .update(spaceMembers)
    .set({ role: input.role })
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))

  const before = toMember(row)
  const after = toMember({ ...row, role: input.role })

  await writeAudit(tx, { spaceId, entityType: 'space_member', entityId: memberEntityId(spaceId, userId), action: 'update', before, after, actor })

  return after
}

export async function removeMember(tx: Database, spaceId: string, userId: string, actor: Actor): Promise<void> {
  const row = await lockMember(tx, spaceId, userId)

  if (row.role === 'owner') await assertAnotherOwner(tx, spaceId, userId)

  await tx.delete(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))

  await writeAudit(tx, {
    spaceId,
    entityType: 'space_member',
    entityId: memberEntityId(spaceId, userId),
    action: 'delete',
    before: toMember(row),
    after: null,
    actor,
  })
}
