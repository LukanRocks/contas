import { describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'
import type { Database } from '../src/db/client.ts'
import { accounts, transactions } from '../src/db/schema.ts'
import { UNIQUE_VIOLATION } from '../src/lib/errors.ts'
import { newId } from '../src/lib/ids.ts'
import { auditOf, call, createAccount, createCast, createSpace, createUser, sqlStateOf, withRollback } from './helpers.ts'

const accountsOf = (sid: string) => `/v1/spaces/${sid}/accounts`
const accountAt = (sid: string, id: string) => `/v1/spaces/${sid}/accounts/${id}`

/** A transaction written directly: the transactions API arrives in the next milestone. */
async function insertTransfer(db: Database, spaceId: string, fromAccountId: string, toAccountId: string) {
  await db
    .insert(transactions)
    .values({ id: newId(), spaceId, name: 'Transfer', fromAccountId, toAccountId, fromValue: 100n, toValue: 100n, occurredAt: new Date() })
}

describe('POST /v1/spaces/:sid/accounts', () => {
  test('creates a managed account and audits it', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const res = await call(app, 'POST', accountsOf(space.id), { user: editor.id, body: { name: 'Nubank', kind: 'managed', currency_code: 'BRL' } })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        id: expect.any(String),
        space_id: space.id,
        name: 'Nubank',
        kind: 'managed',
        currency_code: 'BRL',
        system_key: null,
        archived_at: null,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      })

      const [row] = await auditOf(db, 'account', res.body.id)

      expect(row).toMatchObject({ spaceId: space.id, action: 'create', before: null, after: res.body, actorId: editor.id })
    }))

  test('creates an unmanaged account', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const res = await call(app, 'POST', accountsOf(space.id), { user: editor.id, body: { name: 'Amazon US', kind: 'unmanaged', currency_code: 'USD' } })

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ kind: 'unmanaged', currency_code: 'USD' })
    }))

  test('rejects a system account with 422', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const res = await call(app, 'POST', accountsOf(space.id), { user: owner.id, body: { name: 'Mine', kind: 'system', currency_code: 'BRL' } })

      expect(res.status).toBe(422)
      expect(res.body.errors).toEqual([{ path: 'kind', message: expect.stringContaining('System accounts are created by the server') }])
    }))

  test('rejects an unknown or malformed currency with 422', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)

      for (const currency_code of ['XYZ', 'brl', 'BR', 'XAU']) {
        const res = await call(app, 'POST', accountsOf(space.id), { user: owner.id, body: { name: 'Mine', kind: 'managed', currency_code } })

        expect(res.status).toBe(422)
        expect(res.body.errors[0].path).toBe('currency_code')
      }
    }))

  test('is 409 for a name already used in the space, in any case', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)

      await createAccount(db, space, owner, { name: 'Nubank' })

      const res = await call(app, 'POST', accountsOf(space.id), { user: owner.id, body: { name: 'NUBANK', kind: 'unmanaged', currency_code: 'USD' } })

      expect(res.status).toBe(409)
      expect(res.body.detail).toContain('"Nubank"')
    }))

  test('allows the same name in another space', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const other = await createSpace(db, owner, 'Other')

      await createAccount(db, space, owner, { name: 'Nubank' })

      const res = await call(app, 'POST', accountsOf(other.id), { user: owner.id, body: { name: 'Nubank', kind: 'managed', currency_code: 'BRL' } })

      expect(res.status).toBe(201)
    }))

  test('is 409 for a name reserved for an Opening Balance account, in any case', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)

      for (const name of ['Opening Balance BRL', 'opening balance usd', 'OPENING BALANCE JPY']) {
        const res = await call(app, 'POST', accountsOf(space.id), { user: owner.id, body: { name, kind: 'unmanaged', currency_code: 'BRL' } })

        expect(res.status).toBe(409)
        expect(res.body.detail).toContain('reserved')
      }
    }))

  test('does not reserve a name whose code is not a currency', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const body = { name: 'Opening Balance XYZ', kind: 'unmanaged', currency_code: 'BRL' }
      const res = await call(app, 'POST', accountsOf(space.id), { user: owner.id, body })

      expect(res.status).toBe(201)
    }))

  test('trims the name and rejects an empty one', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const trimmed = await call(app, 'POST', accountsOf(space.id), { user: owner.id, body: { name: '  Nubank ', kind: 'managed', currency_code: 'BRL' } })
      const blank = await call(app, 'POST', accountsOf(space.id), { user: owner.id, body: { name: '   ', kind: 'managed', currency_code: 'BRL' } })

      expect(trimmed.body.name).toBe('Nubank')
      expect(blank.status).toBe(422)
    }))
})

describe('GET /v1/spaces/:sid/accounts', () => {
  async function seedAccounts(db: Database) {
    const cast = await createCast(db)
    const { owner, space } = cast
    const nubank = await createAccount(db, space, owner, { name: 'Nubank' })
    const wise = await createAccount(db, space, owner, { name: 'Wise', currency_code: 'USD' })
    const market = await createAccount(db, space, owner, { name: 'Supermercado', kind: 'unmanaged' })
    const old = await createAccount(db, space, owner, { name: 'Banco Antigo', kind: 'unmanaged' })

    await db.update(accounts).set({ archivedAt: new Date() }).where(eq(accounts.id, old.id))

    return { ...cast, nubank, wise, market, old }
  }

  const names = (body: { data: { name: string }[] }) => body.data.map((account) => account.name)

  test('lists active accounts by name, system ones included', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space } = await seedAccounts(db)
      const res = await call(app, 'GET', accountsOf(space.id), { user: viewer.id })

      expect(res.status).toBe(200)
      expect(names(res.body)).toEqual(['Nubank', 'Opening Balance BRL', 'Opening Balance USD', 'Supermercado', 'Wise'])
    }))

  test('filters by kind and currency', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space } = await seedAccounts(db)

      expect(names((await call(app, 'GET', `${accountsOf(space.id)}?kind=managed`, { user: viewer.id })).body)).toEqual(['Nubank', 'Wise'])
      expect(names((await call(app, 'GET', `${accountsOf(space.id)}?kind=system`, { user: viewer.id })).body)).toEqual([
        'Opening Balance BRL',
        'Opening Balance USD',
      ])
      expect(names((await call(app, 'GET', `${accountsOf(space.id)}?currency=USD`, { user: viewer.id })).body)).toEqual(['Opening Balance USD', 'Wise'])
      expect(names((await call(app, 'GET', `${accountsOf(space.id)}?kind=unmanaged&currency=BRL`, { user: viewer.id })).body)).toEqual(['Supermercado'])
    }))

  test('archived=true lists only archived accounts, archived=all lists both', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space } = await seedAccounts(db)

      expect(names((await call(app, 'GET', `${accountsOf(space.id)}?archived=true`, { user: viewer.id })).body)).toEqual(['Banco Antigo'])
      expect(names((await call(app, 'GET', `${accountsOf(space.id)}?archived=all`, { user: viewer.id })).body)).toHaveLength(6)
      expect(names((await call(app, 'GET', `${accountsOf(space.id)}?archived=false`, { user: viewer.id })).body)).toHaveLength(5)
    }))

  test('rejects bad filters with 422', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space } = await seedAccounts(db)

      for (const query of ['kind=cash', 'currency=brl', 'archived=yes']) {
        expect((await call(app, 'GET', `${accountsOf(space.id)}?${query}`, { user: viewer.id })).status).toBe(422)
      }
    }))

  test("never shows another space's accounts", () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await seedAccounts(db)
      const other = await createSpace(db, owner, 'Other')

      expect((await call(app, 'GET', accountsOf(other.id), { user: owner.id })).body).toEqual({ data: [] })
      expect((await call(app, 'GET', accountsOf(space.id), { user: owner.id })).body.data).toHaveLength(5)
    }))
})

describe('GET /v1/spaces/:sid/accounts/:id', () => {
  test('returns the account to any member', () =>
    withRollback(async ({ app, db }) => {
      const { owner, viewer, space } = await createCast(db)
      const nubank = await createAccount(db, space, owner, { name: 'Nubank' })

      expect((await call(app, 'GET', accountAt(space.id, nubank.id), { user: viewer.id })).body).toEqual(nubank)
    }))

  test('is 404 for an account of another space, even one the user can see', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const other = await createSpace(db, owner, 'Other')
      const elsewhere = await createAccount(db, other, owner, { name: 'Elsewhere' })

      expect((await call(app, 'GET', accountAt(space.id, elsewhere.id), { user: owner.id })).status).toBe(404)
      expect((await call(app, 'GET', accountAt(space.id, newId()), { user: owner.id })).status).toBe(404)
      expect((await call(app, 'GET', accountAt(space.id, 'nope'), { user: owner.id })).status).toBe(404)
    }))
})

describe('PATCH /v1/spaces/:sid/accounts/:id', () => {
  test('renames and audits before and after', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const nubank = await createAccount(db, space, editor, { name: 'Nubank' })
      const res = await call(app, 'PATCH', accountAt(space.id, nubank.id), { user: editor.id, body: { name: 'Nubank PF' } })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ id: nubank.id, name: 'Nubank PF' })

      const updates = (await auditOf(db, 'account', nubank.id)).filter((row) => row.action === 'update')

      expect(updates).toEqual([expect.objectContaining({ before: nubank, after: res.body, actorId: editor.id })])
    }))

  test('allows changing only the case of its own name', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const nubank = await createAccount(db, space, editor, { name: 'Nubank' })

      expect((await call(app, 'PATCH', accountAt(space.id, nubank.id), { user: editor.id, body: { name: 'NUBANK' } })).body.name).toBe('NUBANK')
    }))

  test("is 409 for another account's name or a reserved one", () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const nubank = await createAccount(db, space, editor, { name: 'Nubank' })

      await createAccount(db, space, editor, { name: 'Itaú' })

      expect((await call(app, 'PATCH', accountAt(space.id, nubank.id), { user: editor.id, body: { name: 'itaú' } })).status).toBe(409)
      expect((await call(app, 'PATCH', accountAt(space.id, nubank.id), { user: editor.id, body: { name: 'Opening Balance EUR' } })).status).toBe(409)
    }))

  test('rejects kind with 422, whatever the value', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const nubank = await createAccount(db, space, editor, { name: 'Nubank' })

      for (const kind of ['unmanaged', 'managed', null]) {
        const res = await call(app, 'PATCH', accountAt(space.id, nubank.id), { user: editor.id, body: { name: 'X', kind } })

        expect(res.status).toBe(422)
        expect(res.body.errors).toEqual([{ path: 'kind', message: "An account's kind cannot be changed." }])
      }
    }))

  test('rejects an empty body and unknown fields with 422', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const nubank = await createAccount(db, space, editor, { name: 'Nubank' })

      expect((await call(app, 'PATCH', accountAt(space.id, nubank.id), { user: editor.id, body: {} })).status).toBe(422)
      expect((await call(app, 'PATCH', accountAt(space.id, nubank.id), { user: editor.id, body: { space_id: space.id } })).body.errors).toContainEqual({
        path: 'space_id',
        message: 'Unknown field.',
      })
    }))

  test('changes the currency while no transaction uses the account', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const market = await createAccount(db, space, editor, { name: 'Amazon', kind: 'unmanaged' })
      const res = await call(app, 'PATCH', accountAt(space.id, market.id), { user: editor.id, body: { currency_code: 'USD' } })

      expect(res.status).toBe(200)
      expect(res.body.currency_code).toBe('USD')
    }))

  test('is 409 for a currency change once a transaction uses the account, on either side', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const nubank = await createAccount(db, space, editor, { name: 'Nubank' })
      const market = await createAccount(db, space, editor, { name: 'Supermercado', kind: 'unmanaged' })

      await insertTransfer(db, space.id, nubank.id, market.id)

      for (const account of [nubank, market]) {
        const res = await call(app, 'PATCH', accountAt(space.id, account.id), { user: editor.id, body: { currency_code: 'USD' } })

        expect(res.status).toBe(409)
        expect(res.body.code).toBe('conflict')
      }
    }))

  test('allows sending the current currency of a used account, since nothing changes', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const nubank = await createAccount(db, space, editor, { name: 'Nubank' })
      const market = await createAccount(db, space, editor, { name: 'Supermercado', kind: 'unmanaged' })

      await insertTransfer(db, space.id, nubank.id, market.id)

      const res = await call(app, 'PATCH', accountAt(space.id, nubank.id), { user: editor.id, body: { currency_code: 'BRL', name: 'Nubank PF' } })

      expect(res.status).toBe(200)
    }))

  test('is 422 for an unknown currency', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const nubank = await createAccount(db, space, editor, { name: 'Nubank' })

      expect((await call(app, 'PATCH', accountAt(space.id, nubank.id), { user: editor.id, body: { currency_code: 'XYZ' } })).status).toBe(422)
    }))

  test('archives and unarchives, keeping the first archive date', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const old = await createAccount(db, space, editor, { name: 'Banco Antigo' })
      const archived = await call(app, 'PATCH', accountAt(space.id, old.id), { user: editor.id, body: { archived: true } })
      const again = await call(app, 'PATCH', accountAt(space.id, old.id), { user: editor.id, body: { archived: true } })
      const restored = await call(app, 'PATCH', accountAt(space.id, old.id), { user: editor.id, body: { archived: false } })

      expect(archived.body.archived_at).toMatch(/Z$/)
      expect(again.body.archived_at).toBe(archived.body.archived_at)
      expect(restored.body.archived_at).toBeNull()
    }))

  test('lets an account that transactions use be archived', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const nubank = await createAccount(db, space, editor, { name: 'Nubank' })
      const market = await createAccount(db, space, editor, { name: 'Supermercado', kind: 'unmanaged' })

      await insertTransfer(db, space.id, nubank.id, market.id)

      expect((await call(app, 'PATCH', accountAt(space.id, market.id), { user: editor.id, body: { archived: true } })).status).toBe(200)
    }))

  test('is 403 for a system account, and leaves it untouched', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)

      await createAccount(db, space, owner, { name: 'Nubank' })

      const [system] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.spaceId, space.id), eq(accounts.kind, 'system')))

      for (const body of [{ name: 'Mine now' }, { archived: true }, { currency_code: 'USD' }]) {
        const res = await call(app, 'PATCH', accountAt(space.id, system!.id), { user: owner.id, body })

        expect(res.status).toBe(403)
        expect(res.body.code).toBe('forbidden')
      }

      const [after] = await db.select().from(accounts).where(eq(accounts.id, system!.id))

      expect(after).toEqual(system!)
    }))
})

describe('DELETE /v1/spaces/:sid/accounts/:id', () => {
  test('deletes an account no transaction uses, and audits it', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const market = await createAccount(db, space, editor, { name: 'Supermercado', kind: 'unmanaged' })

      expect((await call(app, 'DELETE', accountAt(space.id, market.id), { user: editor.id })).status).toBe(204)
      expect((await call(app, 'GET', accountAt(space.id, market.id), { user: editor.id })).status).toBe(404)

      const [, deleted] = await auditOf(db, 'account', market.id)

      expect(deleted).toMatchObject({ action: 'delete', before: market, after: null, actorId: editor.id })
    }))

  test('is 409 when a transaction uses the account, on either side', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const nubank = await createAccount(db, space, editor, { name: 'Nubank' })
      const market = await createAccount(db, space, editor, { name: 'Supermercado', kind: 'unmanaged' })

      await insertTransfer(db, space.id, nubank.id, market.id)

      for (const account of [nubank, market]) {
        const res = await call(app, 'DELETE', accountAt(space.id, account.id), { user: editor.id })

        expect(res.status).toBe(409)
        expect(res.body.detail).toContain('Archive it instead')
      }
    }))

  test('is 403 for a system account', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)

      await createAccount(db, space, owner, { name: 'Nubank' })

      const [system] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.spaceId, space.id), eq(accounts.kind, 'system')))

      expect((await call(app, 'DELETE', accountAt(space.id, system!.id), { user: owner.id })).status).toBe(403)
    }))

  test('is 404 for an unknown account', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)

      expect((await call(app, 'DELETE', accountAt(space.id, newId()), { user: owner.id })).status).toBe(404)
    }))
})

describe('account names in the database (§7.2.6)', () => {
  test('stay unique per space regardless of case, even when written directly', () =>
    withRollback(async ({ db }) => {
      const owner = await createUser(db, 'Owner')
      const space = await createSpace(db, owner, 'Casa')

      await createAccount(db, space, owner, { name: 'Nubank', kind: 'unmanaged' })

      const code = await sqlStateOf(db, (savepoint) =>
        savepoint.insert(accounts).values({ id: newId(), spaceId: space.id, name: 'nubank', kind: 'unmanaged', currencyCode: 'BRL' }),
      )

      expect(code).toBe(UNIQUE_VIOLATION)
    }))
})
