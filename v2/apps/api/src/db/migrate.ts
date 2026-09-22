import { migrate } from 'drizzle-orm/postgres-js/migrator'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { fileURLToPath } from 'node:url'
import { requireEnv } from '../env.ts'
import { createDb } from './client.ts'
import { seedCurrencies } from './seed-currencies.ts'

const MIGRATIONS = fileURLToPath(new URL('./migrations', import.meta.url))

/** Applies pending migrations, then (re)seeds the currency table. Safe to run on every start. */
export async function migrateAndSeed(db: PostgresJsDatabase): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS })
  await seedCurrencies(db)
}

if (import.meta.main) {
  const { db, sql } = createDb(requireEnv('DATABASE_URL'))
  try {
    await migrateAndSeed(db)
    console.log('[db] migrations applied, currencies seeded')
  } finally {
    await sql.end()
  }
}
