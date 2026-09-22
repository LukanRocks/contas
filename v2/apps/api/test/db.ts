import { createDb } from '../src/db/client.ts'
import { env, requireEnv } from '../src/env.ts'

const url = requireEnv('DATABASE_URL_TEST')

// Tests truncate tables, so never let them near the real database.
if (env.DATABASE_URL && new URL(env.DATABASE_URL).href === new URL(url).href) {
  throw new Error('DATABASE_URL_TEST is the same database as DATABASE_URL; refusing to run tests against it.')
}

/** The one connection pool the whole suite shares. */
export const { db: testDb, sql: testSql } = createDb(url)
