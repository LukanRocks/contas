import { describe, expect, spyOn, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import type { Database } from '../src/db/client.ts'
import { auditLog, spaceMembers, spaces, users } from '../src/db/schema.ts'
import { call, createUser, withCommittedDb } from './helpers.ts'

/** Makes every audit insert fail, for as long as `fn` runs. Committed, so it applies to the requests' own transactions. */
async function withBrokenAudit(db: Database, fn: () => Promise<void>) {
  await db.execute(sql`CREATE FUNCTION test_break_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit broken by test'; END $$`)
  await db.execute(sql`CREATE TRIGGER test_break_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION test_break_audit()`)

  const log = spyOn(console, 'error').mockImplementation(() => {})

  try {
    await fn()
  } finally {
    log.mockRestore()
    await db.execute(sql`DROP TRIGGER test_break_audit ON audit_log`)
    await db.execute(sql`DROP FUNCTION test_break_audit()`)
  }
}

// Committed state: atomicity is about what survives a request's own transaction, so these cannot run inside a rolled-back one.
describe('audit rows are written in the same transaction as the data', () => {
  test('a write and its audit row commit together', () =>
    withCommittedDb(async ({ app, db }) => {
      const res = await call(app, 'POST', '/v1/users', { body: { name: 'Ana' } })

      expect(res.status).toBe(201)
      expect(await db.select().from(auditLog).where(eq(auditLog.entityId, res.body.id))).toHaveLength(1)
    }))

  test('when the audit row fails, the user is not created either', () =>
    withCommittedDb(async ({ app, db }) => {
      await withBrokenAudit(db, async () => {
        const res = await call(app, 'POST', '/v1/users', { body: { name: 'Ghost' } })

        expect(res.status).toBe(500)
      })

      expect(await db.select().from(users).where(eq(users.name, 'Ghost'))).toEqual([])
    }))

  test('when the audit row fails, neither the space nor its owner membership is created', () =>
    withCommittedDb(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')

      await withBrokenAudit(db, async () => {
        expect((await call(app, 'POST', '/v1/spaces', { user: ana.id, body: { name: 'Ghost' } })).status).toBe(500)
      })

      expect(await db.select().from(spaces).where(eq(spaces.name, 'Ghost'))).toEqual([])
      expect(await db.select().from(spaceMembers).where(eq(spaceMembers.userId, ana.id))).toEqual([])
    }))
})
