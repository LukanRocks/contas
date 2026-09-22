import { z } from 'zod'
import { emptyAsAbsent, PageQuery, Timestamp, Uuid } from './primitives.ts'

export const AuditEntityType = z.enum(['user', 'space', 'space_member', 'account', 'transaction']).meta({ id: 'AuditEntityType' })
export type AuditEntityType = z.infer<typeof AuditEntityType>

export const AuditAction = z.enum(['create', 'update', 'delete']).meta({ id: 'AuditAction' })
export type AuditAction = z.infer<typeof AuditAction>

/** The entity as the API represented it at that moment. */
const Snapshot = z.record(z.string(), z.unknown()).nullable()

export const AuditEntry = z
  .object({
    id: Uuid,
    entity_type: AuditEntityType,
    entity_id: z.string().meta({ description: 'The entity id, or "space_id:user_id" for a membership.' }),
    action: AuditAction,
    before: Snapshot.meta({ description: 'Null on create.' }),
    after: Snapshot.meta({ description: 'Null on delete.' }),
    actor_id: Uuid.nullable().meta({ description: 'Kept even after that user is deleted.' }),
    actor_name: z.string().nullable().meta({ description: "The actor's name when the entry was written." }),
    at: Timestamp,
  })
  .meta({ id: 'AuditEntry' })
export type AuditEntry = z.infer<typeof AuditEntry>

export const AuditLog = z
  .object({
    data: z.array(AuditEntry),
    next_cursor: z.string().nullable().meta({ description: 'Pass as `cursor` for the next page. Null on the last page.' }),
  })
  .meta({ id: 'AuditLog' })
export type AuditLog = z.infer<typeof AuditLog>

export const AuditLogQuery = z.object({
  entity_type: emptyAsAbsent(AuditEntityType),
  entity_id: emptyAsAbsent(z.string()).meta({ description: 'One entity, e.g. a transaction id.' }),
  ...PageQuery,
})
export type AuditLogQuery = z.infer<typeof AuditLogQuery>
