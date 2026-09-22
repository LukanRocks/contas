import { describe, expect, test } from 'bun:test'
import type { App } from '../src/app.ts'
import { call, createAccount, createCast, createSpace, createTransaction, withRollback } from './helpers.ts'

const auditLogOf = (sid: string, query = '') => `/v1/spaces/${sid}/audit-log${query}`

type Entry = { id: string; entity_type: string; entity_id: string; action: string }

/** Follows next_cursor to the end, collecting every entry. */
async function everyEntry(app: App, user: string, path: string): Promise<Entry[]> {
  const entries: Entry[] = []
  let cursor: string | null = null

  do {
    const separator = path.includes('?') ? '&' : '?'
    const res = await call(app, 'GET', cursor ? `${path}${separator}cursor=${cursor}` : path, { user })

    expect(res.status).toBe(200)
    entries.push(...res.body.data)
    cursor = res.body.next_cursor
  } while (cursor)

  return entries
}

describe('GET /v1/spaces/:sid/audit-log', () => {
  test("lists the space's entries newest first, to any member", () =>
    withRollback(async ({ app, db }) => {
      const { owner, viewer, space } = await createCast(db)
      const nubank = await createAccount(db, space, owner, { name: 'Nubank' })
      const res = await call(app, 'GET', auditLogOf(space.id), { user: viewer.id })

      expect(res.status).toBe(200)
      expect(res.body.next_cursor).toBeNull()
      expect(res.body.data[0]).toEqual({
        id: expect.any(String),
        entity_type: 'account',
        entity_id: expect.any(String),
        action: 'create',
        before: null,
        after: expect.objectContaining({ kind: 'system', name: 'Opening Balance BRL' }),
        actor_id: owner.id,
        actor_name: 'Owner',
        at: expect.stringMatching(/Z$/),
      })
      expect(res.body.data[1]).toMatchObject({ entity_type: 'account', entity_id: nubank.id, after: nubank })
      // Oldest: the space itself, then the owner joining it, then the two members.
      expect(res.body.data.slice(-4).map((entry: Entry) => [entry.entity_type, entry.action])).toEqual([
        ['space_member', 'create'],
        ['space_member', 'create'],
        ['space_member', 'create'],
        ['space', 'create'],
      ])
    }))

  test('filters by entity_type and entity_id', () =>
    withRollback(async ({ app, db }) => {
      const { owner, viewer, space } = await createCast(db)
      const nubank = await createAccount(db, space, owner, { name: 'Nubank' })
      const market = await createAccount(db, space, owner, { name: 'Supermercado', kind: 'unmanaged' })
      const feira = await createTransaction(db, space, owner, { name: 'Feira', from_account_id: nubank.id, to_account_id: market.id, from_value: '12000' })

      await call(app, 'PATCH', `/v1/spaces/${space.id}/transactions/${feira.id}`, { user: owner.id, body: { from_value: '21000', to_value: '21000' } })

      const transactionsOnly = await everyEntry(app, viewer.id, auditLogOf(space.id, '?entity_type=transaction'))
      const oneEntity = await everyEntry(app, viewer.id, auditLogOf(space.id, `?entity_type=transaction&entity_id=${feira.id}`))

      expect(transactionsOnly.every((entry) => entry.entity_type === 'transaction')).toBe(true)
      expect(oneEntity.map((entry) => entry.action)).toEqual(['update', 'create'])
    }))

  test('names memberships by space_id:user_id', () =>
    withRollback(async ({ app, db }) => {
      const { owner, editor, space } = await createCast(db)
      const entries = await everyEntry(app, owner.id, auditLogOf(space.id, `?entity_id=${space.id}:${editor.id}`))

      expect(entries).toEqual([expect.objectContaining({ entity_type: 'space_member', action: 'create' })])
    }))

  test('hides user-level entries, which belong to no space', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)

      await call(app, 'PATCH', `/v1/users/${owner.id}`, { user: owner.id, body: { name: 'Owner renamed' } })

      expect(await everyEntry(app, owner.id, auditLogOf(space.id, '?entity_type=user'))).toEqual([])
    }))

  test("never shows another space's entries", () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const other = await createSpace(db, owner, 'Other')

      await createAccount(db, other, owner, { name: 'Elsewhere', kind: 'unmanaged' })

      const entries = await everyEntry(app, owner.id, auditLogOf(space.id))

      expect(entries.some((entry) => entry.entity_type === 'account')).toBe(false)
    }))

  test('pages through entries that share one timestamp, each exactly once, in write order', () =>
    withRollback(async ({ app, db }) => {
      const { owner, viewer, space } = await createCast(db)

      // Everything in this test runs in one transaction, so every entry gets the same `at`: only the id orders them.
      for (let index = 0; index < 9; index++) await createAccount(db, space, owner, { name: `Shop ${index}`, kind: 'unmanaged' })

      const all = (await call(app, 'GET', auditLogOf(space.id, '?limit=200'), { user: viewer.id })).body.data as Entry[]

      expect(new Set(all.map((entry) => (entry as Entry & { at: string }).at)).size).toBe(1)

      for (const limit of [1, 2, 5]) {
        expect((await everyEntry(app, viewer.id, auditLogOf(space.id, `?limit=${limit}`))).map((entry) => entry.id)).toEqual(all.map((entry) => entry.id))
      }

      expect(all.slice(0, 9).map((entry) => (entry as Entry & { after: { name: string } }).after.name)).toEqual(
        [8, 7, 6, 5, 4, 3, 2, 1, 0].map((index) => `Shop ${index}`),
      )
    }))

  test('is 400 for a bad cursor and 422 for a bad limit or entity_type', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space } = await createCast(db)

      expect((await call(app, 'GET', auditLogOf(space.id, '?cursor=nope'), { user: viewer.id })).status).toBe(400)

      for (const query of ['?limit=0', '?limit=201', '?entity_type=widget']) {
        expect((await call(app, 'GET', auditLogOf(space.id, query), { user: viewer.id })).status).toBe(422)
      }
    }))

  test('is 404 for a non-member', () =>
    withRollback(async ({ app, db }) => {
      const { outsider, space } = await createCast(db)

      expect((await call(app, 'GET', auditLogOf(space.id), { user: outsider.id })).status).toBe(404)
    }))
})
