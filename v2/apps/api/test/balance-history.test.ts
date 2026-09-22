import { describe, expect, test } from 'bun:test'
import type { App } from '../src/app.ts'
import type { Database } from '../src/db/client.ts'
import { balanceBefore } from '../src/modules/balances/service.ts'
import { call, createAccount, createSpace, createTransaction, withRollback } from './helpers.ts'
import { createLedger } from './ledger.ts'

const historyOf = (sid: string, id: string) => `/v1/spaces/${sid}/accounts/${id}/balance-history`

const SAO_PAULO_MONTHS = ['2026-06-01T03:00:00Z', '2026-07-01T03:00:00Z', '2026-08-01T03:00:00Z', '2026-09-01T03:00:00Z']
const UTC_MONTHS = ['2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z']

/** Consecutive São Paulo midnights from 1 January 2028, a leap year. */
const dailyEdges = (count: number) => [...Array(count).keys()].map((day) => new Date(Date.UTC(2028, 0, 1 + day, 3)).toISOString())

/**
 * The credit card of the demo's Casa space (§13.3), June to August 2026: every transaction that touches it.
 * Its expected history is spelled out in §13.5, so these tests pin the exact numbers.
 */
async function createCard(db: Database) {
  const ledger = await createLedger(db)
  const { owner, space, nubank, market, ifood, amazonUs } = ledger
  const card = await createAccount(db, space, owner, {
    name: 'Cartão de Crédito',
    opening_balance: { value: '-150000', occurred_at: '2026-06-01T03:00:00Z' },
  })
  const amazonBr = await createAccount(db, space, owner, { name: 'Amazon BR', kind: 'unmanaged' })
  const receita = await createAccount(db, space, owner, { name: 'Receita Federal', kind: 'unmanaged' })
  const add = (name: string, from: string, to: string, from_value: string, occurred_at: string, to_value?: string) =>
    createTransaction(db, space, owner, { name, from_account_id: from, to_account_id: to, from_value, to_value, occurred_at })

  for (const [month, payment] of [
    ['06', '150000'],
    ['07', '73550'],
    ['08', '153240'],
  ] as const) {
    await add('Pagamento fatura', nubank.id, card.id, payment, `2026-${month}-10T15:00:00Z`)
    await add('Supermercado', card.id, market.id, '65000', `2026-${month}-12T15:00:00Z`)
  }

  await add('Jantar', card.id, ifood.id, '8550', '2026-06-15T15:00:00Z')
  await add('Pedido Amazon', card.id, amazonBr.id, '30000', '2026-07-08T15:00:00Z')
  await add('Teclado', card.id, amazonUs.id, '50000', '2026-07-14T15:00:00Z', '9200')
  await add('IOF', card.id, receita.id, '1750', '2026-07-14T15:00:00Z')
  // 31 July, 22:30 in São Paulo: July there, August in UTC.
  await add('Pizza', card.id, ifood.id, '6490', '2026-08-01T01:30:00Z')

  return { ...ledger, card }
}

async function history(app: App, user: string, sid: string, id: string, edges: unknown) {
  return call(app, 'POST', historyOf(sid, id), { user, body: { edges } })
}

describe('POST /v1/spaces/:sid/accounts/:id/balance-history', () => {
  test('São Paulo months, sent as UTC edges, give the §13.5 numbers', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space, card } = await createCard(db)
      const res = await history(app, viewer.id, space.id, card.id, SAO_PAULO_MONTHS)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        account_id: card.id,
        currency: 'BRL',
        starting_balance: '0',
        points: [
          { period_start: '2026-06-01T03:00:00.000Z', period_end: '2026-07-01T03:00:00.000Z', inflow: '150000', outflow: '223550', balance: '-73550' },
          { period_start: '2026-07-01T03:00:00.000Z', period_end: '2026-08-01T03:00:00.000Z', inflow: '73550', outflow: '153240', balance: '-153240' },
          { period_start: '2026-08-01T03:00:00.000Z', period_end: '2026-09-01T03:00:00.000Z', inflow: '153240', outflow: '65000', balance: '-65000' },
        ],
      })
    }))

  test('UTC months put the pizza in August instead: the same transaction, a different period', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space, card } = await createCard(db)
      const res = await history(app, viewer.id, space.id, card.id, UTC_MONTHS)

      expect(res.body.starting_balance).toBe('0')
      expect(res.body.points.map((point: { balance: string }) => point.balance)).toEqual(['-73550', '-146750', '-65000'])
      expect(res.body.points[1]).toMatchObject({ inflow: '73550', outflow: '146750' })
      expect(res.body.points[2]).toMatchObject({ inflow: '153240', outflow: '71490' })
    }))

  test('a transaction exactly on an edge belongs to the period that starts there', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space, card } = await createCard(db)
      // The opening balance is at 2026-06-01T03:00:00Z, the first São Paulo edge.
      const fromOpening = await history(app, viewer.id, space.id, card.id, ['2026-06-01T03:00:00Z', '2026-06-01T03:00:01Z'])
      const untilOpening = await history(app, viewer.id, space.id, card.id, ['2026-05-01T03:00:00Z', '2026-06-01T03:00:00Z'])

      expect(fromOpening.body.starting_balance).toBe('0')
      expect(fromOpening.body.points[0]).toMatchObject({ outflow: '150000', balance: '-150000' })
      expect(untilOpening.body.points[0]).toMatchObject({ inflow: '0', outflow: '0', balance: '0' })
    }))

  test('starting_balance counts only transactions before the first edge', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space, card } = await createCard(db)
      const res = await history(app, viewer.id, space.id, card.id, SAO_PAULO_MONTHS.slice(1))

      expect(res.body.starting_balance).toBe('-73550')
      expect(res.body.points.map((point: { balance: string }) => point.balance)).toEqual(['-153240', '-65000'])
    }))

  test('sums periods of unequal length, like calendar months or a custom range', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space, card } = await createCard(db)
      // 9 days, then 21, then 62.
      const edges = ['2026-06-01T00:00:00Z', '2026-06-10T00:00:00Z', '2026-07-01T00:00:00Z', '2026-09-01T00:00:00Z']
      const res = await history(app, viewer.id, space.id, card.id, edges)

      expect(res.body.points.map((point: { inflow: string; outflow: string; balance: string }) => [point.inflow, point.outflow, point.balance])).toEqual([
        ['0', '150000', '-150000'],
        ['150000', '73550', '-73550'],
        ['226790', '218240', '-65000'],
      ])
    }))

  test('returns empty and future periods, carrying the balance forward', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space, card } = await createCard(db)
      const edges = ['2026-09-01T03:00:00Z', '2026-10-01T03:00:00Z', '2030-01-01T03:00:00Z', '2031-01-01T03:00:00Z']
      const res = await history(app, viewer.id, space.id, card.id, edges)

      expect(res.body.starting_balance).toBe('-65000')
      expect(res.body.points).toHaveLength(3)

      for (const point of res.body.points) expect(point).toMatchObject({ inflow: '0', outflow: '0', balance: '-65000' })
    }))

  test('ends where balanceBefore(the last edge) is, for any edges (the §10.9 invariant)', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space, card } = await createCard(db)
      const edgeSets = [SAO_PAULO_MONTHS, UTC_MONTHS, ['2026-07-14T15:00:00Z', '2026-08-01T01:30:00Z'], ['2026-06-12T15:00:00Z', '2026-07-12T15:00:00.001Z']]

      for (const edges of edgeSets) {
        const res = await history(app, viewer.id, space.id, card.id, edges)
        const last = res.body.points.at(-1)

        expect(last.balance).toBe((await balanceBefore(db, card.id, new Date(edges.at(-1)!))).toString())
      }
    }))

  test('keeps sums past 2^63 exact', () =>
    withRollback(async ({ app, db }) => {
      const { owner, viewer, space, nubank, openingBrl } = await createLedger(db)
      const max = '9223372036854775807'

      for (const day of ['01', '02', '03']) {
        const occurred_at = `2026-06-${day}T15:00:00Z`

        await createTransaction(db, space, owner, { name: 'Huge', from_account_id: openingBrl.id, to_account_id: nubank.id, from_value: max, occurred_at })
      }

      const res = await history(app, viewer.id, space.id, nubank.id, ['2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z', '2026-07-01T00:00:00Z'])

      expect(res.body.points[1]).toMatchObject({ inflow: '18446744073709551614', balance: '27670116110564327421' })
    }))

  test('accepts 367 edges, i.e. a leap year of days', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space, card } = await createCard(db)
      const edges = dailyEdges(367)
      const res = await history(app, viewer.id, space.id, card.id, edges)

      expect(res.status).toBe(200)
      expect(res.body.points).toHaveLength(366)
    }))

  for (const [label, edges] of [
    ['no edges', []],
    ['a single edge', ['2026-06-01T03:00:00Z']],
    ['368 edges', dailyEdges(368)],
    ['edges out of order', ['2026-07-01T03:00:00Z', '2026-06-01T03:00:00Z']],
    ['a duplicate edge', ['2026-06-01T03:00:00Z', '2026-06-01T03:00:00Z', '2026-07-01T03:00:00Z']],
    ['the same instant written twice', ['2026-06-01T03:00:00Z', '2026-06-01T03:00:00.000Z']],
    ['an edge without Z', ['2026-06-01T03:00:00', '2026-07-01T03:00:00Z']],
    ['an edge in local time', ['2026-06-01T00:00:00-03:00', '2026-07-01T03:00:00Z']],
    ['an edge that is not a string', [1780282800000, '2026-07-01T03:00:00Z']],
    ['edges that are not a list', '2026-06-01T03:00:00Z'],
  ] as const) {
    test(`is 422 for ${label}`, () =>
      withRollback(async ({ app, db }) => {
        const { viewer, space, card } = await createCard(db)
        const res = await history(app, viewer.id, space.id, card.id, edges)

        expect(res.status).toBe(422)
        expect(res.body.code).toBe('validation_error')
        expect(res.body.errors[0].path).toStartWith('edges')
      }))
  }

  test('names the first edge that breaks the order', () =>
    withRollback(async ({ app, db }) => {
      const { viewer, space, card } = await createCard(db)
      const edges = ['2026-06-01T03:00:00Z', '2026-07-01T03:00:00Z', '2026-07-01T03:00:00Z', '2026-05-01T03:00:00Z']
      const res = await history(app, viewer.id, space.id, card.id, edges)

      expect(res.body.errors).toEqual([{ path: 'edges.2', message: 'Must be later than edges[1]: edges are strictly increasing.' }])
    }))

  test('is 422 for an unknown field and 404 for an account of another space', () =>
    withRollback(async ({ app, db }) => {
      const { owner, viewer, space, card } = await createCard(db)
      const other = await createSpace(db, owner, 'Other')
      const elsewhere = await createAccount(db, other, owner, { name: 'Elsewhere' })

      const body = { edges: UTC_MONTHS, timezone: 'America/Sao_Paulo' }

      expect((await call(app, 'POST', historyOf(space.id, card.id), { user: viewer.id, body })).status).toBe(422)
      expect((await history(app, owner.id, space.id, elsewhere.id, UTC_MONTHS)).status).toBe(404)
    }))
})
