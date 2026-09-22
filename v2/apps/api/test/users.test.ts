import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { accounts, spaceMembers, transactions, users } from '../src/db/schema.ts'
import { newId } from '../src/lib/ids.ts'
import { addMember, auditOf, call, createSpace, createUser, withRollback } from './helpers.ts'

const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('POST /v1/users', () => {
  test('creates a user and audits it with no actor when sent without X-User-Id', () =>
    withRollback(async ({ app, db }) => {
      const res = await call(app, 'POST', '/v1/users', { body: { name: 'Ana' } })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ id: expect.any(String), name: 'Ana', created_at: expect.stringMatching(ISO_MS), updated_at: expect.stringMatching(ISO_MS) })

      const [row] = await auditOf(db, 'user', res.body.id)

      expect(row).toMatchObject({ spaceId: null, action: 'create', before: null, after: res.body, actorId: null, actorName: null })
    }))

  test('records the sender as the actor when X-User-Id is sent', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const res = await call(app, 'POST', '/v1/users', { user: ana.id, body: { name: 'Bruno' } })
      const [row] = await auditOf(db, 'user', res.body.id)

      expect(row).toMatchObject({ actorId: ana.id, actorName: 'Ana' })
    }))

  test('ids are UUIDv7', () =>
    withRollback(async ({ app }) => {
      const res = await call(app, 'POST', '/v1/users', { body: { name: 'Ana' } })

      expect(res.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }))

  test('trims leading and trailing whitespace before checking and storing the name', () =>
    withRollback(async ({ app }) => {
      const res = await call(app, 'POST', '/v1/users', { body: { name: `  Ana Maria\t` } })

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('Ana Maria')
      expect((await call(app, 'POST', '/v1/users', { body: { name: ` ${'a'.repeat(100)} ` } })).status).toBe(201)
    }))

  test('names each unknown field in its own error', () =>
    withRollback(async ({ app }) => {
      const res = await call(app, 'POST', '/v1/users', { body: { name: 'Ana', admin: true, nmae: 'x' } })

      expect(res.status).toBe(422)
      expect(res.body.errors).toEqual([
        { path: 'admin', message: 'Unknown field.' },
        { path: 'nmae', message: 'Unknown field.' },
      ])
    }))

  test('accepts 100 characters, counted as code points', () =>
    withRollback(async ({ app }) => {
      expect((await call(app, 'POST', '/v1/users', { body: { name: 'a'.repeat(100) } })).status).toBe(201)
      expect((await call(app, 'POST', '/v1/users', { body: { name: '🙂'.repeat(100) } })).status).toBe(201)
    }))

  for (const [label, body] of [
    ['no name', {}],
    ['an empty name', { name: '' }],
    ['101 characters', { name: 'a'.repeat(101) }],
    ['101 emoji', { name: '🙂'.repeat(101) }],
    ['a NUL character', { name: `A${String.fromCharCode(0)}B` }],
    ['a name that is not a string', { name: 42 }],
    ['a name of only spaces', { name: '   ' }],
    ['a name of only whitespace', { name: ' \t\n ' }],
    ['an unknown field', { name: 'Ana', admin: true }],
  ] as const) {
    test(`rejects ${label} with 422`, () =>
      withRollback(async ({ app }) => {
        const res = await call(app, 'POST', '/v1/users', { body })

        expect(res.status).toBe(422)
        expect(res.body.code).toBe('validation_error')
        expect(res.body.errors.length).toBeGreaterThan(0)
      }))
  }
})

describe('GET /v1/users', () => {
  test('lists every user by name, ignoring case', () =>
    withRollback(async ({ app, db }) => {
      const bruno = await createUser(db, 'bruno')
      const ana = await createUser(db, 'Ana')

      await createUser(db, 'Carla')

      const res = await call(app, 'GET', '/v1/users', { user: ana.id })

      expect(res.status).toBe(200)
      expect(res.body.data.map((user: { name: string }) => user.name)).toEqual(['Ana', 'bruno', 'Carla'])
      expect(res.body.data[1]).toEqual(bruno)
    }))
})

describe('GET /v1/users/:id', () => {
  test('returns the user', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const bruno = await createUser(db, 'Bruno')
      const res = await call(app, 'GET', `/v1/users/${bruno.id}`, { user: ana.id })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(bruno)
    }))

  test('is 404 for an unknown or malformed id', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')

      expect((await call(app, 'GET', `/v1/users/${newId()}`, { user: ana.id })).status).toBe(404)
      expect((await call(app, 'GET', '/v1/users/not-a-uuid', { user: ana.id })).status).toBe(404)
    }))
})

describe('PATCH /v1/users/:id', () => {
  test('renames any user and audits before and after', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const bruno = await createUser(db, 'Bruno')
      const res = await call(app, 'PATCH', `/v1/users/${bruno.id}`, { user: ana.id, body: { name: 'Bruno S.' } })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ id: bruno.id, name: 'Bruno S.', created_at: bruno.created_at })
      expect(res.body.updated_at).not.toBe(bruno.updated_at)

      const [, update] = await auditOf(db, 'user', bruno.id)

      expect(update).toMatchObject({ action: 'update', before: bruno, after: res.body, actorId: ana.id, actorName: 'Ana' })
    }))

  test('keeps the old name on audit rows the user wrote before', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const space = await createSpace(db, ana, 'Casa')

      await call(app, 'PATCH', `/v1/users/${ana.id}`, { user: ana.id, body: { name: 'Ana Maria' } })

      const [created] = await auditOf(db, 'space', space.id)

      expect(created).toMatchObject({ actorId: ana.id, actorName: 'Ana' })
    }))

  test('trims the new name too', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const res = await call(app, 'PATCH', `/v1/users/${ana.id}`, { user: ana.id, body: { name: ' Ana Maria ' } })

      expect(res.body.name).toBe('Ana Maria')
    }))

  test('is 404 for an unknown user and 422 for a bad name', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')

      expect((await call(app, 'PATCH', `/v1/users/${newId()}`, { user: ana.id, body: { name: 'X' } })).status).toBe(404)
      expect((await call(app, 'PATCH', `/v1/users/${ana.id}`, { user: ana.id, body: { name: '' } })).status).toBe(422)
      expect((await call(app, 'PATCH', `/v1/users/${ana.id}`, { user: ana.id, body: { name: '   ' } })).status).toBe(422)
    }))
})

describe('DELETE /v1/users/:id', () => {
  test('deletes the user and audits it', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const bruno = await createUser(db, 'Bruno')
      const res = await call(app, 'DELETE', `/v1/users/${bruno.id}`, { user: ana.id })

      expect(res.status).toBe(204)
      expect((await call(app, 'GET', `/v1/users/${bruno.id}`, { user: ana.id })).status).toBe(404)

      const [, deleted] = await auditOf(db, 'user', bruno.id)

      expect(deleted).toMatchObject({ spaceId: null, action: 'delete', before: bruno, after: null, actorId: ana.id })
    }))

  test('a user can delete themselves', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')

      expect((await call(app, 'DELETE', `/v1/users/${ana.id}`, { user: ana.id })).status).toBe(204)
    }))

  test('is 409 while the user is the only owner of a space', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const bruno = await createUser(db, 'Bruno')
      const space = await createSpace(db, ana, 'Casa')

      await addMember(db, space, ana, bruno, 'editor')

      const res = await call(app, 'DELETE', `/v1/users/${ana.id}`, { user: bruno.id })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('conflict')
      expect(res.body.detail).toContain('"Casa"')
      expect(await db.select().from(users).where(eq(users.id, ana.id))).toHaveLength(1)
    }))

  test('removes their memberships, auditing each in its space, once another owner remains', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const bruno = await createUser(db, 'Bruno')
      const casa = await createSpace(db, ana, 'Casa')
      const estudio = await createSpace(db, ana, 'Estúdio')

      await addMember(db, casa, ana, bruno, 'owner')
      await addMember(db, estudio, ana, bruno, 'viewer')

      expect((await call(app, 'DELETE', `/v1/users/${bruno.id}`, { user: ana.id })).status).toBe(204)
      expect(await db.select().from(spaceMembers).where(eq(spaceMembers.userId, bruno.id))).toEqual([])

      for (const space of [casa, estudio]) {
        const rows = await auditOf(db, 'space_member', `${space.id}:${bruno.id}`)

        expect(rows.map((row) => row.action)).toEqual(['create', 'delete'])
        expect(rows[1]).toMatchObject({
          spaceId: space.id,
          before: expect.objectContaining({ user_id: bruno.id, user_name: 'Bruno' }),
          after: null,
          actorId: ana.id,
        })
      }
    }))

  test("keeps the deleted user's audit rows and their transactions, with created_by cleared", () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const bruno = await createUser(db, 'Bruno')
      const space = await createSpace(db, ana, 'Casa')

      await addMember(db, space, ana, bruno, 'owner')

      // Written directly: the transactions API arrives in a later milestone.
      const [nubank, market] = [newId(), newId()]

      await db.insert(accounts).values([
        { id: nubank, spaceId: space.id, name: 'Nubank', kind: 'managed', currencyCode: 'BRL' },
        { id: market, spaceId: space.id, name: 'Supermercado', kind: 'unmanaged', currencyCode: 'BRL' },
      ])

      const txId = newId()

      await db.insert(transactions).values({
        id: txId,
        spaceId: space.id,
        name: 'Feira',
        fromAccountId: nubank,
        toAccountId: market,
        fromValue: 12000n,
        toValue: 12000n,
        occurredAt: new Date(),
        createdBy: ana.id,
      })

      expect((await call(app, 'DELETE', `/v1/users/${ana.id}`, { user: bruno.id })).status).toBe(204)

      const [row] = await db.select().from(transactions).where(eq(transactions.id, txId))
      const [spaceCreated] = await auditOf(db, 'space', space.id)

      expect(row?.createdBy).toBeNull()
      expect(spaceCreated).toMatchObject({ actorId: ana.id, actorName: 'Ana' })
    }))

  test('is 404 for an unknown user', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')

      expect((await call(app, 'DELETE', `/v1/users/${newId()}`, { user: ana.id })).status).toBe(404)
    }))
})
