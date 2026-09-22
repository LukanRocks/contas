import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

/**
 * What services and routes receive: the root client, or a transaction opened
 * on it. Both can open a (nested) transaction, so a service never needs to
 * know which one it was handed -- tests rely on that to roll everything back.
 */
export type Database = PgDatabase<PostgresJsQueryResultHKT>

export function createDb(url: string) {
  const sql = postgres(url, {
    // Fail fast when Postgres is down, so /health answers inside its check window.
    connect_timeout: 5,
    onnotice: () => {},
  })
  const db = drizzle({ client: sql })
  return { db, sql }
}
