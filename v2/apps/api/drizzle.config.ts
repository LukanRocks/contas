import { defineConfig } from 'drizzle-kit'

// `generate` only diffs the schema against the committed snapshots, so it needs
// no database. Migrations are applied by src/db/migrate.ts, not drizzle-kit.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
})
