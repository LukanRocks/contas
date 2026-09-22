import { describe, expect, test } from 'bun:test'
import { and, eq, or } from 'drizzle-orm'
import type { Database } from '../src/db/client.ts'
import { accounts, transactions } from '../src/db/schema.ts'
import { auditOf, call, createAccount, createCast, withRollback } from './helpers.ts'

const accountsOf = (sid: string) => `/v1/spaces/${sid}/accounts`

const systemAccounts = (db: Database, spaceId: string) =>
  db
    .select()
    .from(accounts)
    .where(and(eq(accounts.spaceId, spaceId), eq(accounts.kind, 'system')))
    .orderBy(accounts.currencyCode)

const transactionsOf = (db: Database, accountId: string) =>
  db
    .select()
    .from(transactions)
    .where(or(eq(transactions.fromAccountId, accountId), eq(transactions.toAccountId, accountId)))

describe('Opening Balance system accounts (§7.3.1)', () => {
  test('the first managed account in a currency creates one, audited as the acting user', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)

      expect(await systemAccounts(db, space.id)).toEqual([])

      await call(app, 'POST', accountsOf(space.id), { user: editor.id, body: { name: 'Nubank', kind: 'managed', currency_code: 'BRL' } })

      const [system] = await systemAccounts(db, space.id)

      expect(system).toMatchObject({ name: 'Opening Balance BRL', kind: 'system', currencyCode: 'BRL', systemKey: 'opening_balance', archivedAt: null })

      const [created] = await auditOf(db, 'account', system!.id)

      expect(created).toMatchObject({
        spaceId: space.id,
        action: 'create',
        before: null,
        after: expect.objectContaining({ kind: 'system' }),
        actorId: editor.id,
      })
    }))

  test('later managed accounts in that currency reuse it', () =>
    withRollback(async ({ db }) => {
      const { owner, space } = await createCast(db)

      await createAccount(db, space, owner, { name: 'Nubank' })
      await createAccount(db, space, owner, { name: 'Poupança' })

      const systems = await systemAccounts(db, space.id)

      expect(systems).toHaveLength(1)
      expect(await auditOf(db, 'account', systems[0]!.id)).toHaveLength(1)
    }))

  test('each new currency gets its own, even without an opening balance', () =>
    withRollback(async ({ db }) => {
      const { owner, space } = await createCast(db)

      await createAccount(db, space, owner, { name: 'Nubank' })
      await createAccount(db, space, owner, { name: 'Wise Business', currency_code: 'USD' })

      expect((await systemAccounts(db, space.id)).map((system) => system.name)).toEqual(['Opening Balance BRL', 'Opening Balance USD'])
    }))

  test('an unmanaged account creates none', () =>
    withRollback(async ({ db }) => {
      const { owner, space } = await createCast(db)

      await createAccount(db, space, owner, { name: 'Amazon US', kind: 'unmanaged', currency_code: 'USD' })

      expect(await systemAccounts(db, space.id)).toEqual([])
    }))

  test("changing a managed account's currency creates one for the new currency", () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const wallet = await createAccount(db, space, owner, { name: 'Wallet' })

      await call(app, 'PATCH', `${accountsOf(space.id)}/${wallet.id}`, { user: owner.id, body: { currency_code: 'EUR' } })

      expect((await systemAccounts(db, space.id)).map((system) => system.name)).toEqual(['Opening Balance BRL', 'Opening Balance EUR'])
    }))

  test("changing an unmanaged account's currency creates none", () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const shop = await createAccount(db, space, owner, { name: 'Shop', kind: 'unmanaged' })

      await call(app, 'PATCH', `${accountsOf(space.id)}/${shop.id}`, { user: owner.id, body: { currency_code: 'EUR' } })

      expect(await systemAccounts(db, space.id)).toEqual([])
    }))
})

describe('opening_balance on POST /accounts (§7.3.2, §7.3.3)', () => {
  test('a positive value flows from the Opening Balance account into the new one', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createCast(db)
      const res = await call(app, 'POST', accountsOf(space.id), {
        user: editor.id,
        body: { name: 'Nubank', kind: 'managed', currency_code: 'BRL', opening_balance: { value: '320000', occurred_at: '2026-06-01T03:00:00Z' } },
      })
      const [system] = await systemAccounts(db, space.id)
      const [opening] = await transactionsOf(db, res.body.id)

      expect(res.status).toBe(201)
      expect(opening).toMatchObject({
        spaceId: space.id,
        name: 'Opening balance',
        fromAccountId: system!.id,
        toAccountId: res.body.id,
        fromValue: 320000n,
        toValue: 320000n,
        occurredAt: new Date('2026-06-01T03:00:00Z'),
        notes: null,
        createdBy: editor.id,
      })
    }))

  test('a negative value flows out of the new account, as its absolute value', () =>
    withRollback(async ({ db }) => {
      const { owner, space } = await createCast(db)
      const card = await createAccount(db, space, owner, { name: 'Cartão de Crédito', opening_balance: { value: '-150000' } })
      const [system] = await systemAccounts(db, space.id)
      const [opening] = await transactionsOf(db, card.id)

      expect(opening).toMatchObject({ fromAccountId: card.id, toAccountId: system!.id, fromValue: 150000n, toValue: 150000n })
    }))

  test('zero records no transaction', () =>
    withRollback(async ({ db }) => {
      const { owner, space } = await createCast(db)

      for (const value of ['0', '-0', '000']) {
        const account = await createAccount(db, space, owner, { name: `Zero ${value}`, opening_balance: { value } })

        expect(await transactionsOf(db, account.id)).toEqual([])
      }
    }))

  test('occurred_at defaults to now', () =>
    withRollback(async ({ db }) => {
      const { owner, space } = await createCast(db)
      const before = Date.now()
      const account = await createAccount(db, space, owner, { name: 'Nubank', opening_balance: { value: '100' } })
      const [opening] = await transactionsOf(db, account.id)

      expect(opening!.occurredAt.getTime()).toBeGreaterThanOrEqual(before)
      expect(opening!.occurredAt.getTime()).toBeLessThanOrEqual(Date.now())
    }))

  test('keeps millisecond precision', () =>
    withRollback(async ({ db }) => {
      const { owner, space } = await createCast(db)
      const account = await createAccount(db, space, owner, { name: 'Nubank', opening_balance: { value: '100', occurred_at: '2026-06-01T03:00:00.123Z' } })
      const [opening] = await transactionsOf(db, account.id)

      expect(opening!.occurredAt.toISOString()).toBe('2026-06-01T03:00:00.123Z')
    }))

  test('writes its own audit row, with values as strings', () =>
    withRollback(async ({ db }) => {
      const { owner, space } = await createCast(db)
      const account = await createAccount(db, space, owner, { name: 'Nubank', opening_balance: { value: '320000', occurred_at: '2026-06-01T03:00:00Z' } })
      const [opening] = await transactionsOf(db, account.id)
      const [row] = await auditOf(db, 'transaction', opening!.id)

      expect(row).toMatchObject({
        spaceId: space.id,
        action: 'create',
        before: null,
        after: expect.objectContaining({
          id: opening!.id,
          name: 'Opening balance',
          from_value: '320000',
          from_currency: 'BRL',
          to_value: '320000',
          to_currency: 'BRL',
          occurred_at: '2026-06-01T03:00:00.000Z',
        }),
        actorId: owner.id,
      })
    }))

  test('stores values above 2^53 exactly', () =>
    withRollback(async ({ db }) => {
      const { owner, space } = await createCast(db)
      const big = '9007199254740993'
      const account = await createAccount(db, space, owner, { name: 'Vault', opening_balance: { value: big } })
      const [opening] = await transactionsOf(db, account.id)
      const [row] = await auditOf(db, 'transaction', opening!.id)

      expect(opening!.toValue.toString()).toBe(big)
      expect(row!.after).toMatchObject({ to_value: big })
    }))

  test('is 422 on an unmanaged account, even when zero', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)

      for (const value of ['100', '0']) {
        const res = await call(app, 'POST', accountsOf(space.id), {
          user: owner.id,
          body: { name: `Shop ${value}`, kind: 'unmanaged', currency_code: 'BRL', opening_balance: { value } },
        })

        expect(res.status).toBe(422)
        expect(res.body.errors).toEqual([{ path: 'opening_balance', message: 'Only managed accounts have an opening balance.' }])
      }

      expect(await systemAccounts(db, space.id)).toEqual([])
    }))

  for (const [label, opening_balance, path] of [
    ['a decimal value', { value: '3200.00' }, 'opening_balance.value'],
    ['a numeric value', { value: 320000 }, 'opening_balance.value'],
    ['a value past the 64-bit range', { value: '-9223372036854775808' }, 'opening_balance.value'],
    ['a local-time occurred_at', { value: '100', occurred_at: '2026-06-01T00:00:00-03:00' }, 'opening_balance.occurred_at'],
    ['an occurred_at without an offset', { value: '100', occurred_at: '2026-06-01T00:00:00' }, 'opening_balance.occurred_at'],
    ['an impossible date', { value: '100', occurred_at: '2026-02-30T00:00:00Z' }, 'opening_balance.occurred_at'],
    ['an unknown field', { value: '100', date: '2026-06-01T00:00:00Z' }, 'opening_balance.date'],
    ['no value', { occurred_at: '2026-06-01T00:00:00Z' }, 'opening_balance.value'],
  ] as const) {
    test(`is 422 for ${label}, creating nothing`, () =>
      withRollback(async ({ app, db }) => {
        const { owner, space } = await createCast(db)
        const body = { name: 'Nubank', kind: 'managed', currency_code: 'BRL', opening_balance }
        const res = await call(app, 'POST', accountsOf(space.id), { user: owner.id, body })

        expect(res.status).toBe(422)
        expect(res.body.errors.map((error: { path: string }) => error.path)).toContain(path)
        expect(await db.select().from(accounts).where(eq(accounts.spaceId, space.id))).toEqual([])
      }))
  }

  test('the largest values in range are accepted, both ways', () =>
    withRollback(async ({ db }) => {
      const { owner, space } = await createCast(db)
      const rich = await createAccount(db, space, owner, { name: 'Rich', opening_balance: { value: '9223372036854775807' } })
      const poor = await createAccount(db, space, owner, { name: 'Poor', opening_balance: { value: '-9223372036854775807' } })

      expect((await transactionsOf(db, rich.id))[0]!.toValue).toBe(9223372036854775807n)
      expect((await transactionsOf(db, poor.id))[0]!.fromValue).toBe(9223372036854775807n)
    }))
})
