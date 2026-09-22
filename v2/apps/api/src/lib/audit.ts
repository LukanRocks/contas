import type { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../db/schema.ts'
import { auditLog } from '../db/schema.ts'
import type { Database } from '../db/client.ts'
import { newId } from './ids.ts'
import type { Actor } from './router.ts'

export type AuditEntry = {
  /** NULL for user-level events. */
  spaceId: string | null
  entityType: (typeof AUDIT_ENTITY_TYPES)[number]
  /** The entity's id, or "space_id:user_id" for memberships. */
  entityId: string
  action: (typeof AUDIT_ACTIONS)[number]
  /** The entity's API representation, null on create. */
  before: object | null
  /** The entity's API representation, null on delete. */
  after: object | null
  /** Null only when nobody was acting, e.g. a user created without X-User-Id. */
  actor: Actor | null
}

/**
 * Call with the same transaction as the write it records, so the two commit or roll back together.
 * The actor's name is copied, so the row still says who acted after that user is renamed or deleted.
 */
export async function writeAudit(tx: Database, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    id: newId(),
    spaceId: entry.spaceId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before,
    after: entry.after,
    actorId: entry.actor?.id ?? null,
    actorName: entry.actor?.name ?? null,
  })
}
