import { sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { badRequest } from './errors.ts'
import { isUuid } from './ids.ts'

/**
 * Where a page ends, in the list's own order: newest first by a timestamp, then by id.
 * The timestamp keeps Postgres' full microsecond precision. A JS Date only holds milliseconds,
 * and rounding would skip or repeat rows that fall in the same millisecond, like audit rows written in one transaction.
 */
export type Cursor = { at: string; id: string }

const MICROSECOND_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/

/** Select this beside each row to build a cursor from it. */
export const cursorTimestamp = (column: AnyColumn) => sql<string>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

/** Opaque to clients: base64url JSON, so its shape can change without breaking them. */
export const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url')

/** A malformed or tampered cursor is a 400, never a query that errors. */
export function decodeCursor(value: string): Cursor {
  try {
    const cursor: unknown = JSON.parse(Buffer.from(value, 'base64url').toString())

    if (typeof cursor === 'object' && cursor !== null && 'at' in cursor && 'id' in cursor) {
      const { at, id } = cursor

      if (typeof at === 'string' && typeof id === 'string' && MICROSECOND_UTC.test(at) && isUuid(id)) return { at, id }
    }
  } catch {
    // Falls through to the same answer as a well-formed but wrong cursor.
  }

  throw badRequest('The cursor is not valid. Pass the next_cursor of a previous page unchanged.')
}

/** Rows strictly after the cursor in (timestamp DESC, id DESC) order. */
export const afterCursor = (timestamp: AnyColumn, id: AnyColumn, cursor: Cursor): SQL =>
  sql`(${timestamp}, ${id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`

/**
 * Trims the extra row a page query fetched to learn whether another page follows.
 * Query `limit + 1` rows, and pass them here with each row's cursor.
 */
export function page<Row>(rows: Row[], limit: number, cursorOf: (row: Row) => Cursor): { rows: Row[]; nextCursor: string | null } {
  if (rows.length <= limit) return { rows, nextCursor: null }

  const kept = rows.slice(0, limit)

  return { rows: kept, nextCursor: encodeCursor(cursorOf(kept[kept.length - 1]!)) }
}
