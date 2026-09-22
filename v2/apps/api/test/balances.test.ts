import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import type { App } from '../src/app.ts'
import type { Database } from '../src/db/client.ts'
import { accounts } from '../src/db/schema.ts'
import { call, createAccount, createCast, createSpace, createTransaction, withRollback } from './helpers.ts'
import { createLedger } from './ledger.ts'

type Ledger = Awaited<ReturnType<typeof createLedger>>

const balanceOf = (sid: string, id: string, at?: string) => `/v1/spaces/${sid}/accounts/${id}/balance${at ? `?at=${at}` : ''}`
const balancesOf = (sid: string, at?: string) => `/v1/spaces/${sid}/balances${at ? `?at=${at}` : ''}`

/** A small month of movements across kinds and currencies. */
async function seedMovements(db: Database, ledger: Ledger) {
  const { owner, space, nubank, savings, wise, market, amazonUs, openingBrl, openingUsd } = ledger
  const add = (name: string, from: string, to: string, from_value: string, occurred_at: string, to_value?: string) =>
    createTransaction(db, space, owner, { name, from_account_id: from, to_account_id: to, from_value, to_value, occurred_at })

  await add('Opening balance', openingBrl.id, nubank.id, '320000', '2026-06-01T03:00:00Z')
  await add('Opening balance', openingUsd.id, wise.id, '25000', '2026-06-01T03:00:00Z')
  await add('Feira', nubank.id, market.id, '12000', '2026-06-18T15:00:00Z')
  await add('Reserva', nubank.id, savings.id, '100000', '2026-06-25T15:00:00Z')
  await add('Teclado', nubank.id, amazonUs.id, '50000', '2026-07-14T15:00:00Z', '9200')
  await add('Conversão', wise.id, nubank.id, '10000', '2026-08-03T15:00:00Z', '54500')
}

async function balance(app: App, user: string, sid: string, id: string, at?: string) {
  const res = await call(app, 'GET', balanceOf(sid, id, at), { user })

  expect(res.status).toBe(200)

  return res.body.balance
}

describe('GET /v1/spaces/:sid/accounts/:id/balance', () => {
  test('is what flowed in minus what flowed out, now by default', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)
      const before = Date.now()

      await seedMovements(db, ledger)

      const res = await call(app, 'GET', balanceOf(ledger.space.id, ledger.nubank.id), { user: ledger.viewer.id })

      // 3200.00 in, then 120.00, 1000.00 and 500.00 out, then 545.00 in from the dollar conversion.
      expect(res.body).toEqual({ account_id: ledger.nubank.id, currency: 'BRL', balance: '212500', at: expect.any(String) })
      expect(Date.parse(res.body.at)).toBeGreaterThanOrEqual(before)
    }))

  test('works for every kind, each in its own currency', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)
      const { viewer, space } = ledger

      await seedMovements(db, ledger)

      expect(await balance(app, viewer.id, space.id, ledger.wise.id)).toBe('15000')
      expect(await balance(app, viewer.id, space.id, ledger.market.id)).toBe('12000')
      expect(await balance(app, viewer.id, space.id, ledger.amazonUs.id)).toBe('9200')
      expect(await balance(app, viewer.id, space.id, ledger.openingBrl.id)).toBe('-320000')
      expect(await balance(app, viewer.id, space.id, ledger.openingUsd.id)).toBe('-25000')
      expect(await balance(app, viewer.id, space.id, ledger.ifood.id)).toBe('0')

      const amazon = await call(app, 'GET', balanceOf(space.id, ledger.amazonUs.id), { user: viewer.id })

      expect(amazon.body.currency).toBe('USD')
    }))

  test('at is inclusive, to the millisecond', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)
      const { viewer, space, nubank } = ledger

      await seedMovements(db, ledger)

      expect(await balance(app, viewer.id, space.id, nubank.id, '2026-06-18T15:00:00Z')).toBe('308000')
      expect(await balance(app, viewer.id, space.id, nubank.id, '2026-06-18T14:59:59.999Z')).toBe('320000')
      expect(await balance(app, viewer.id, space.id, nubank.id, '2026-06-01T02:59:59.999Z')).toBe('0')
    }))

  test('echoes the instant it used', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space, nubank } = await createLedger(db)
      const res = await call(app, 'GET', balanceOf(space.id, nubank.id, '2026-06-18T15:00:00Z'), { user: viewer.id })

      expect(res.body.at).toBe('2026-06-18T15:00:00.000Z')
    }))

  test('keeps values above 2^53, and sums past 2^63, exact', () =>
    withRollback(async ({ app, db }) => {
      const { owner, viewer, space, nubank, openingBrl } = await createLedger(db)
      const vault = await createAccount(db, space, owner, { name: 'Vault', opening_balance: { value: '9007199254740993' } })

      expect(await balance(app, viewer.id, space.id, vault.id)).toBe('9007199254740993')

      for (const day of ['01', '02']) {
        await createTransaction(db, space, owner, {
          name: 'Huge',
          from_account_id: openingBrl.id,
          to_account_id: nubank.id,
          from_value: '9223372036854775807',
          occurred_at: `2026-06-${day}T15:00:00Z`,
        })
      }

      expect(await balance(app, viewer.id, space.id, nubank.id)).toBe('18446744073709551614')
    }))

  test('is 422 for an at that is not UTC, and 404 for an account of another space', () =>
    withRollback(async ({ app, db }) => {
      const { owner, viewer, space, nubank } = await createLedger(db)
      const other = await createSpace(db, owner, 'Other')
      const elsewhere = await createAccount(db, other, owner, { name: 'Elsewhere' })

      for (const at of ['2026-06-18', '2026-06-18T12:00:00-03:00']) {
        expect((await call(app, 'GET', balanceOf(space.id, nubank.id, at), { user: viewer.id })).status).toBe(422)
      }

      expect((await call(app, 'GET', balanceOf(space.id, elsewhere.id), { user: owner.id })).status).toBe(404)
    }))
})

describe('GET /v1/spaces/:sid/balances', () => {
  test('lists every managed account, archived ones included, with totals per currency', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)

      await seedMovements(db, ledger)

      const res = await call(app, 'GET', balancesOf(ledger.space.id), { user: ledger.viewer.id })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        at: expect.any(String),
        accounts: [
          { account_id: ledger.oldBank.id, name: 'Banco Antigo', currency: 'BRL', archived: true, balance: '0' },
          { account_id: ledger.nubank.id, name: 'Nubank', currency: 'BRL', archived: false, balance: '212500' },
          { account_id: ledger.savings.id, name: 'Poupança', currency: 'BRL', archived: false, balance: '100000' },
          { account_id: ledger.wise.id, name: 'Wise USD', currency: 'USD', archived: false, balance: '15000' },
        ],
        totals: [
          { currency: 'BRL', balance: '312500' },
          { currency: 'USD', balance: '15000' },
        ],
      })
    }))

  test('answers as of at', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)

      await seedMovements(db, ledger)

      const res = await call(app, 'GET', balancesOf(ledger.space.id, '2026-06-30T00:00:00Z'), { user: ledger.viewer.id })

      expect(res.body.at).toBe('2026-06-30T00:00:00.000Z')
      expect(res.body.totals).toEqual([
        { currency: 'BRL', balance: '308000' },
        { currency: 'USD', balance: '25000' },
      ])
    }))

  test('counts archiving by the flag, not by leaving the account out', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)

      await seedMovements(db, ledger)
      await db.update(accounts).set({ archivedAt: new Date() }).where(eq(accounts.id, ledger.savings.id))

      const res = await call(app, 'GET', balancesOf(ledger.space.id), { user: ledger.viewer.id })

      expect(res.body.accounts.find((account: { name: string }) => account.name === 'Poupança')).toMatchObject({ archived: true, balance: '100000' })
      expect(res.body.totals[0]).toEqual({ currency: 'BRL', balance: '312500' })
    }))

  test('is empty for a space with no managed accounts', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)

      await createAccount(db, space, owner, { name: 'Supermercado', kind: 'unmanaged' })

      expect((await call(app, 'GET', balancesOf(space.id), { user: owner.id })).body).toEqual({ at: expect.any(String), accounts: [], totals: [] })
    }))
})
