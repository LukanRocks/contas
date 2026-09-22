import { describe, expect, test } from 'bun:test'
import { eq, or } from 'drizzle-orm'
import { accounts, auditLog, spaceMembers, spaces, transactions } from '../src/db/schema.ts'
import { newId } from '../src/lib/ids.ts'
import { auditOf, call, createCast, createSpace, createUser, withCommittedDb, withRollback } from './helpers.ts'

describe('POST /v1/spaces', () => {
  test('creates the space with the creator as owner, auditing both', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const res = await call(app, 'POST', '/v1/spaces', { user: ana.id, body: { name: 'Casa' } })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ id: expect.any(String), name: 'Casa', role: 'owner', created_at: expect.any(String), updated_at: expect.any(String) })

      const members = await db.select().from(spaceMembers).where(eq(spaceMembers.spaceId, res.body.id))

      expect(members).toEqual([expect.objectContaining({ userId: ana.id, role: 'owner' })])

      const { role: _role, ...snapshot } = res.body
      const [spaceRow] = await auditOf(db, 'space', res.body.id)
      const [memberRow] = await auditOf(db, 'space_member', `${res.body.id}:${ana.id}`)

      expect(spaceRow).toMatchObject({ spaceId: res.body.id, action: 'create', before: null, after: snapshot, actorId: ana.id, actorName: 'Ana' })
      expect(memberRow).toMatchObject({
        spaceId: res.body.id,
        action: 'create',
        before: null,
        after: expect.objectContaining({ user_id: ana.id, user_name: 'Ana', role: 'owner' }),
      })
    }))

  test('creates no accounts', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const res = await call(app, 'POST', '/v1/spaces', { user: ana.id, body: { name: 'Casa' } })

      expect(await db.select().from(accounts).where(eq(accounts.spaceId, res.body.id))).toEqual([])
    }))

  test('rejects a bad name with 422', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')

      for (const name of ['', '   ', 'x'.repeat(101)]) expect((await call(app, 'POST', '/v1/spaces', { user: ana.id, body: { name } })).status).toBe(422)
    }))

  test('trims the name', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const res = await call(app, 'POST', '/v1/spaces', { user: ana.id, body: { name: '  Casa ' } })

      expect(res.body.name).toBe('Casa')
    }))
})

describe('GET /v1/spaces', () => {
  test("lists only the acting user's spaces, each with their role, by name", () =>
    withRollback(async ({ app, db }) => {
      const { owner, viewer, outsider, space } = await createCast(db)
      const other = await createSpace(db, owner, 'Another')

      const asOwner = await call(app, 'GET', '/v1/spaces', { user: owner.id })
      const asViewer = await call(app, 'GET', '/v1/spaces', { user: viewer.id })
      const asOutsider = await call(app, 'GET', '/v1/spaces', { user: outsider.id })

      expect(asOwner.body.data.map((space: { id: string; role: string }) => [space.id, space.role])).toEqual([
        [other.id, 'owner'],
        [space.id, 'owner'],
      ])
      expect(asViewer.body.data).toEqual([{ ...space, role: 'viewer' }])
      expect(asOutsider.body).toEqual({ data: [] })
    }))
})

describe('GET /v1/spaces/:sid', () => {
  test("returns the space with the acting user's role", () =>
    withRollback(async ({ app, db }) => {
      const { owner, editor, viewer, space } = await createCast(db)

      for (const [user, role] of [
        [owner, 'owner'],
        [editor, 'editor'],
        [viewer, 'viewer'],
      ] as const) {
        const res = await call(app, 'GET', `/v1/spaces/${space.id}`, { user: user.id })

        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ...space, role })
      }
    }))

  test('is 404 for a non-member, exactly like a space that does not exist', () =>
    withRollback(async ({ app, db }) => {
      const { outsider, space } = await createCast(db)
      const hidden = await call(app, 'GET', `/v1/spaces/${space.id}`, { user: outsider.id })
      const missing = await call(app, 'GET', `/v1/spaces/${newId()}`, { user: outsider.id })

      expect(hidden.status).toBe(404)
      expect(hidden.body).toEqual(missing.body)
      expect((await call(app, 'GET', '/v1/spaces/nope', { user: outsider.id })).status).toBe(404)
    }))
})

describe('PATCH /v1/spaces/:sid', () => {
  test('lets the owner rename it, auditing before and after', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const res = await call(app, 'PATCH', `/v1/spaces/${space.id}`, { user: owner.id, body: { name: 'Lar' } })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ id: space.id, name: 'Lar', role: 'owner' })

      const [, update] = await auditOf(db, 'space', space.id)

      expect(update).toMatchObject({
        action: 'update',
        before: expect.objectContaining({ name: 'Cast' }),
        after: expect.objectContaining({ name: 'Lar' }),
        actorId: owner.id,
      })
      expect(update?.after).not.toHaveProperty('role')
    }))

  test('is 403 for editors and viewers, before the body is even checked', () =>
    withRollback(async ({ app, db }) => {
      const { editor, viewer, space } = await createCast(db)

      for (const user of [editor, viewer]) {
        const res = await call(app, 'PATCH', `/v1/spaces/${space.id}`, { user: user.id, body: { name: '' } })

        expect(res.status).toBe(403)
        expect(res.body.code).toBe('forbidden')
      }
    }))

  test('is 422 for a bad name from the owner', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)

      expect((await call(app, 'PATCH', `/v1/spaces/${space.id}`, { user: owner.id, body: { name: '' } })).status).toBe(422)
    }))
})

describe('DELETE /v1/spaces/:sid', () => {
  test('is 403 for editors and viewers', () =>
    withRollback(async ({ app, db }) => {
      const { editor, viewer, space } = await createCast(db)

      for (const user of [editor, viewer]) expect((await call(app, 'DELETE', `/v1/spaces/${space.id}`, { user: user.id })).status).toBe(403)
    }))

  // Committed state: the cascade has to hold across real statements, not just inside one test transaction.
  test('lets the owner delete everything in it, leaving no trace', () =>
    withCommittedDb(async ({ app, db }) => {
      const { owner, editor, space } = await createCast(db)
      const kept = await createSpace(db, owner, 'Kept')

      // Written directly: accounts and transactions get their API in later milestones.
      const [nubank, market] = [newId(), newId()]

      await db.insert(accounts).values([
        { id: nubank, spaceId: space.id, name: 'Nubank', kind: 'managed', currencyCode: 'BRL' },
        { id: market, spaceId: space.id, name: 'Supermercado', kind: 'unmanaged', currencyCode: 'BRL' },
      ])
      await db.insert(transactions).values({
        id: newId(),
        spaceId: space.id,
        name: 'Feira',
        fromAccountId: nubank,
        toAccountId: market,
        fromValue: 12000n,
        toValue: 12000n,
        occurredAt: new Date(),
        createdBy: editor.id,
      })

      expect((await call(app, 'DELETE', `/v1/spaces/${space.id}`, { user: owner.id })).status).toBe(204)

      expect(await db.select().from(spaces).where(eq(spaces.id, space.id))).toEqual([])
      expect(await db.select().from(spaceMembers).where(eq(spaceMembers.spaceId, space.id))).toEqual([])
      expect(await db.select().from(accounts).where(eq(accounts.spaceId, space.id))).toEqual([])
      expect(await db.select().from(transactions).where(eq(transactions.spaceId, space.id))).toEqual([])

      const traces = await db
        .select()
        .from(auditLog)
        .where(or(eq(auditLog.spaceId, space.id), eq(auditLog.entityId, space.id)))

      expect(traces).toEqual([])
      expect((await call(app, 'GET', `/v1/spaces/${kept.id}`, { user: owner.id })).status).toBe(200)
    }))
})
