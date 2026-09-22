import type { AuditEntry, AuditLog, AuditLogQuery } from '@contas/contracts'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { auditLog } from '../../db/schema.ts'
import { afterCursor, cursorTimestamp, decodeCursor, page } from '../../lib/cursor.ts'

const toAuditEntry = (row: typeof auditLog.$inferSelect): AuditEntry => ({
  id: row.id,
  entity_type: row.entityType,
  entity_id: row.entityId,
  action: row.action,
  before: row.before as AuditEntry['before'],
  after: row.after as AuditEntry['after'],
  actor_id: row.actorId,
  actor_name: row.actorName,
  at: row.at.toISOString(),
})

/**
 * The space's audit log, newest first by (at, id).
 * Rows written in one transaction share `at`, and their UUIDv7 ids keep them in write order.
 * User-level rows have no space, so they never show here.
 */
export async function listAuditLog(db: Database, spaceId: string, query: AuditLogQuery): Promise<AuditLog> {
  const filters: SQL[] = [eq(auditLog.spaceId, spaceId)]

  if (query.entity_type) filters.push(eq(auditLog.entityType, query.entity_type))
  if (query.entity_id) filters.push(eq(auditLog.entityId, query.entity_id))
  if (query.cursor) filters.push(afterCursor(auditLog.at, auditLog.id, decodeCursor(query.cursor)))

  const rows = await db
    .select({ entry: auditLog, cursorAt: cursorTimestamp(auditLog.at) })
    .from(auditLog)
    .where(and(...filters))
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(query.limit + 1)
  const { rows: kept, nextCursor } = page(rows, query.limit, (row) => ({ at: row.cursorAt, id: row.entry.id }))

  return { data: kept.map((row) => toAuditEntry(row.entry)), next_cursor: nextCursor }
}
