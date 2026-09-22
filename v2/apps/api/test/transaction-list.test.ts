import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import type { App } from '../src/app.ts'
import type { Database } from '../src/db/client.ts'
import { transactions } from '../src/db/schema.ts'
import { encodeCursor } from '../src/lib/cursor.ts'
import { newId } from '../src/lib/ids.ts'
import { call, createTransaction, withRollback } from './helpers.ts'
import { createLedger } from './ledger.ts'

type Ledger = Awaited<ReturnType<typeof createLedger>>

const transactionsOf = (sid: string) => `/v1/spaces/${sid}/transactions`

/** Five transactions on known dates, created out of order. */
async function seedMonth(db: Database, ledger: Ledger) {
  const { editor, space, nubank, savings, market, ifood } = ledger
  const add = (name: string, from: string, to: string, occurred_at: string) =>
    createTransaction(db, space, editor, { name, from_account_id: from, to_account_id: to, from_value: '100', occurred_at })

  await add('Aluguel', nubank.id, market.id, '2026-07-06T15:00:00Z')
  await add('Salário', market.id, nubank.id, '2026-07-05T15:00:00Z')
  await add('Pizza', nubank.id, ifood.id, '2026-08-01T01:30:00Z')
  await add('Reserva', nubank.id, savings.id, '2026-07-25T15:00:00Z')
  await add('Lanche 100%_real', savings.id, ifood.id, '2026-07-31T23:59:59.999Z')
}

const names = (body: { data: { name: string }[] }) => body.data.map((transaction) => transaction.name)

/** Follows next_cursor to the end, collecting every page. */
async function allPages(app: App, user: string, path: string) {
  const pages: string[][] = []
  let cursor: string | null = null

  do {
    const separator = path.includes('?') ? '&' : '?'
    const res = await call(app, 'GET', cursor ? `${path}${separator}cursor=${cursor}` : path, { user })

    expect(res.status).toBe(200)
    pages.push(res.body.data.map((transaction: { id: string }) => transaction.id))
    cursor = res.body.next_cursor
  } while (cursor)

  return pages
}

describe('GET /v1/spaces/:sid/transactions', () => {
  test('lists newest first, with next_cursor null on a single page', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)

      await seedMonth(db, ledger)

      const res = await call(app, 'GET', transactionsOf(ledger.space.id), { user: ledger.viewer.id })

      expect(res.status).toBe(200)
      expect(names(res.body)).toEqual(['Pizza', 'Lanche 100%_real', 'Reserva', 'Aluguel', 'Salário'])
      expect(res.body.next_cursor).toBeNull()
      expect(res.body.data[0]).toMatchObject({ from_currency: 'BRL', to_currency: 'BRL' })
    }))

  test('account_id matches either side', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)

      await seedMonth(db, ledger)

      const res = await call(app, 'GET', `${transactionsOf(ledger.space.id)}?account_id=${ledger.savings.id}`, { user: ledger.viewer.id })

      expect(names(res.body)).toEqual(['Lanche 100%_real', 'Reserva'])
    }))

  test('from is inclusive and to is exclusive', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)

      await seedMonth(db, ledger)

      const path = `${transactionsOf(ledger.space.id)}?from=2026-07-06T15:00:00Z&to=2026-08-01T01:30:00Z`

      expect(names((await call(app, 'GET', path, { user: ledger.viewer.id })).body)).toEqual(['Lanche 100%_real', 'Reserva', 'Aluguel'])
    }))

  test('a São Paulo month, sent as UTC edges, catches the pizza at 22:30 local on 31 July', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)

      await seedMonth(db, ledger)

      const july = `${transactionsOf(ledger.space.id)}?from=2026-07-01T03:00:00Z&to=2026-08-01T03:00:00Z`

      expect(names((await call(app, 'GET', july, { user: ledger.viewer.id })).body)).toContain('Pizza')
    }))

  test('q is a case-insensitive substring of the name, with % and _ matching only themselves', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)

      await seedMonth(db, ledger)

      const search = async (text: string) => {
        const res = await call(app, 'GET', `${transactionsOf(ledger.space.id)}?q=${encodeURIComponent(text)}`, { user: ledger.viewer.id })

        return names(res.body)
      }

      expect(await search('SAL')).toEqual(['Salário'])
      expect(await search('a')).toHaveLength(5)
      expect(await search('100%_')).toEqual(['Lanche 100%_real'])
      expect(await search('%')).toEqual(['Lanche 100%_real'])
      expect(await search('_')).toEqual(['Lanche 100%_real'])
      expect(await search('')).toHaveLength(5)
    }))

  test('filters combine', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)

      await seedMonth(db, ledger)

      const path = `${transactionsOf(ledger.space.id)}?account_id=${ledger.nubank.id}&from=2026-07-06T00:00:00Z&q=e`

      expect(names((await call(app, 'GET', path, { user: ledger.viewer.id })).body)).toEqual(['Reserva', 'Aluguel'])
    }))

  test('pages through with limit and next_cursor, ending with null', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)

      await seedMonth(db, ledger)

      const pages = await allPages(app, ledger.viewer.id, `${transactionsOf(ledger.space.id)}?limit=2`)
      const everything = (await call(app, 'GET', transactionsOf(ledger.space.id), { user: ledger.viewer.id })).body.data

      expect(pages.flat()).toEqual(everything.map((transaction: { id: string }) => transaction.id))

      expect(pages.map((ids) => ids.length)).toEqual([2, 2, 1])
    }))

  test('a page that ends exactly at the last row has no next_cursor', () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)

      await seedMonth(db, ledger)

      expect((await call(app, 'GET', `${transactionsOf(ledger.space.id)}?limit=5`, { user: ledger.viewer.id })).body.next_cursor).toBeNull()
    }))

  test('is stable when many rows share a timestamp: every row exactly once, newest id first', () =>
    withRollback(async ({ app, db }) => {
      const { editor, viewer, space, nubank, market } = await createLedger(db)
      const created: string[] = []

      for (let index = 0; index < 7; index++) {
        const transaction = await createTransaction(db, space, editor, {
          name: `Same ${index}`,
          from_account_id: nubank.id,
          to_account_id: market.id,
          from_value: '1',
          occurred_at: '2026-08-10T15:00:00Z',
        })

        created.push(transaction.id)
      }

      for (const limit of [1, 2, 3, 7]) {
        const pages = await allPages(app, viewer.id, `${transactionsOf(space.id)}?limit=${limit}`)

        expect(pages.flat()).toEqual([...created].reverse())
      }
    }))

  test('keeps microsecond order that a millisecond cursor would lose', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space, nubank, market } = await createLedger(db)
      const ids: string[] = []

      // Written directly, so the test controls occurred_at to the microsecond: the API itself only stores milliseconds.
      for (const micros of ['2026-08-10 15:00:00.123001+00', '2026-08-10 15:00:00.123002+00', '2026-08-10 15:00:00.123003+00']) {
        const id = newId()

        ids.push(id)
        await db.execute(sql`INSERT INTO ${transactions} (id, space_id, name, from_account_id, to_account_id, from_value, to_value, occurred_at)
          VALUES (${id}, ${space.id}, 'Micro', ${nubank.id}, ${market.id}, 1, 1, ${micros}::timestamptz)`)
      }

      const pages = await allPages(app, viewer.id, `${transactionsOf(space.id)}?limit=1`)

      expect(pages.flat()).toEqual([...ids].reverse())
    }))

  test('defaults to 50 per page', () =>
    withRollback(async ({ app, db }) => {
      const { editor, viewer, space, nubank, market } = await createLedger(db)

      for (let index = 0; index < 51; index++) {
        await createTransaction(db, space, editor, { name: `T${index}`, from_account_id: nubank.id, to_account_id: market.id, from_value: '1' })
      }

      const first = await call(app, 'GET', transactionsOf(space.id), { user: viewer.id })

      expect(first.body.data).toHaveLength(50)
      expect(first.body.next_cursor).toEqual(expect.any(String))
    }))

  test('is 400 for a malformed or tampered cursor', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space } = await createLedger(db)

      for (const cursor of ['nope', encodeCursor({ at: '2026-08-10T15:00:00Z', id: newId() }), Buffer.from('{"at":1}').toString('base64url')]) {
        const res = await call(app, 'GET', `${transactionsOf(space.id)}?cursor=${cursor}`, { user: viewer.id })

        expect(res.status).toBe(400)
        expect(res.body.code).toBe('bad_request')
      }
    }))

  test('is 422 for a bad limit, account_id or timestamp', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space } = await createLedger(db)

      for (const query of ['limit=0', 'limit=201', 'limit=ten', 'account_id=nope', 'from=2026-07-01', 'to=2026-07-01T00:00:00-03:00']) {
        expect((await call(app, 'GET', `${transactionsOf(space.id)}?${query}`, { user: viewer.id })).status).toBe(422)
      }
    }))

  test("never shows another space's transactions", () =>
    withRollback(async ({ app, db }) => {
      const ledger = await createLedger(db)
      const other = await createLedger(db)

      await seedMonth(db, ledger)

      expect((await call(app, 'GET', transactionsOf(other.space.id), { user: other.viewer.id })).body.data).toEqual([])
    }))
})
