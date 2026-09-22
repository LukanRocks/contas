import { afterAll } from 'bun:test'
import { migrateAndSeed } from '../src/db/migrate.ts'
import { testDb, testSql } from './db.ts'

// Preloaded once for the whole run (bunfig.toml), so this migrates once and the
// afterAll below fires after the last test file, not after each one.
await migrateAndSeed(testDb)

afterAll(async () => {
  await testSql.end()
})
