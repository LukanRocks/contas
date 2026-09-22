import { describe, expect, test } from 'bun:test'
import type { App } from '../src/app.ts'
import { DemoExistsError, runDemoSeed, type DemoSummary } from '../src/db/demo/seed.ts'
import { call, withRollback } from './helpers.ts'

/** Any instant after 2026-08-31 gives the §13.5 balances. */
const AFTER_AUGUST = '2026-09-15T00:00:00Z'

type Account = { id: string; name: string; kind: string; currency_code: string; archived_at: string | null }
type Transaction = { id: string; name: string; created_by: string | null }
type Snapshot = Record<string, unknown> | null
type Entry = { entity_type: string; entity_id: string; action: string; before: Snapshot; after: Snapshot; actor_id: string }

/** Everything the acceptance test reads, all of it through the HTTP API as Ana. */
async function readSpace(app: App, summary: DemoSummary, name: string) {
  const ana = summary.users.ana.id
  const space = summary.spaces.find((candidate) => candidate.name === name)!
  const accounts: Account[] = (await call(app, 'GET', `/v1/spaces/${space.id}/accounts?archived=all`, { user: ana })).body.data
  const balances = new Map<string, string>()

  for (const account of accounts) {
    const res = await call(app, 'GET', `/v1/spaces/${space.id}/accounts/${account.id}/balance?at=${AFTER_AUGUST}`, { user: ana })

    balances.set(account.name, res.body.balance)
  }

  const all = async <Row>(path: string): Promise<Row[]> => {
    const rows: Row[] = []
    let cursor: string | null = null

    do {
      const res = await call(app, 'GET', `${path}${path.includes('?') ? '&' : '?'}limit=200${cursor ? `&cursor=${cursor}` : ''}`, { user: ana })

      rows.push(...res.body.data)
      cursor = res.body.next_cursor
    } while (cursor)

    return rows
  }

  return {
    space,
    accounts,
    account: (accountName: string) => accounts.find((account) => account.name === accountName)!,
    balances,
    totals: (await call(app, 'GET', `/v1/spaces/${space.id}/balances?at=${AFTER_AUGUST}`, { user: ana })).body.totals,
    transactions: await all<Transaction>(`/v1/spaces/${space.id}/transactions`),
    audit: await all<Entry>(`/v1/spaces/${space.id}/audit-log`),
  }
}

/** The sum of every account's balance per currency: what cross-currency transactions add or take away. */
function sumPerCurrency(accounts: Account[], balances: Map<string, string>) {
  const sums: Record<string, string> = {}

  for (const account of accounts) sums[account.currency_code] = (BigInt(sums[account.currency_code] ?? '0') + BigInt(balances.get(account.name)!)).toString()

  return sums
}

const kindsOf = (accounts: Account[]) => ({
  managed: accounts.filter((account) => account.kind === 'managed').length,
  unmanaged: accounts.filter((account) => account.kind === 'unmanaged').length,
  system: accounts.filter((account) => account.kind === 'system').length,
})

describe('the demo seed (§13), checked against §13.5 through the API', () => {
  test('Casa (demo): every account balance, the totals, the counts and the ledger sanity checks', () =>
    withRollback(async ({ app, db }) => {
      const casa = await readSpace(app, await runDemoSeed(db, { reset: false }), 'Casa (demo)')

      expect(Object.fromEntries(casa.balances)).toEqual({
        Nubank: '1842710',
        Poupança: '1300000',
        'Cartão de Crédito': '-65000',
        'Banco Antigo': '0',
        'Wise USD': '15000',
        'Opening Balance BRL': '-1250000',
        'Opening Balance USD': '-25000',
        Empregador: '-2400000',
        Imobiliária: '660000',
        Supermercado: '216000',
        'Companhia de Energia': '54000',
        iFood: '15040',
        'Amazon BR': '30000',
        'Amazon US': '9200',
        'Receita Federal': '1750',
        'Estúdio Ana': '-400000',
      })
      expect(casa.account('Banco Antigo').archived_at).not.toBeNull()
      expect(casa.totals).toEqual([
        { currency: 'BRL', balance: '3077710' },
        { currency: 'USD', balance: '15000' },
      ])
      expect(kindsOf(casa.accounts)).toEqual({ managed: 5, unmanaged: 9, system: 2 })
      expect(casa.transactions).toHaveLength(32)
      // +45.00 BRL and -8.00 USD: the net of the two cross-currency transactions.
      expect(sumPerCurrency(casa.accounts, casa.balances)).toEqual({ BRL: '4500', USD: '-800' })
    }))

  test('Estúdio Ana (demo): managed balances, totals, counts and the ledger sanity checks', () =>
    withRollback(async ({ app, db }) => {
      const estudio = await readSpace(app, await runDemoSeed(db, { reset: false }), 'Estúdio Ana (demo)')

      expect(estudio.balances.get('Conta PJ')).toBe('1203000')
      expect(estudio.balances.get('Wise Business')).toBe('20000')
      expect(estudio.totals).toEqual([
        { currency: 'BRL', balance: '1203000' },
        { currency: 'USD', balance: '20000' },
      ])
      expect(kindsOf(estudio.accounts)).toEqual({ managed: 2, unmanaged: 4, system: 2 })
      expect(estudio.accounts.find((account) => account.name === 'Opening Balance USD')).toBeDefined()
      expect(estudio.transactions).toHaveLength(6)
      expect(sumPerCurrency(estudio.accounts, estudio.balances)).toEqual({ BRL: '548000', USD: '-100000' })
    }))

  test("the credit card's history, by São Paulo months and by UTC months", () =>
    withRollback(async ({ app, db }) => {
      const summary = await runDemoSeed(db, { reset: false })
      const casa = await readSpace(app, summary, 'Casa (demo)')
      const history = async (edges: string[]) =>
        (
          await call(app, 'POST', `/v1/spaces/${casa.space.id}/accounts/${casa.account('Cartão de Crédito').id}/balance-history`, {
            user: summary.users.ana.id,
            body: { edges },
          })
        ).body
      const saoPaulo = await history(['2026-06-01T03:00:00Z', '2026-07-01T03:00:00Z', '2026-08-01T03:00:00Z', '2026-09-01T03:00:00Z'])
      const utc = await history(['2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z'])

      expect(saoPaulo.starting_balance).toBe('0')
      expect(saoPaulo.points.map((point: { inflow: string; outflow: string; balance: string }) => [point.inflow, point.outflow, point.balance])).toEqual([
        ['150000', '223550', '-73550'],
        ['73550', '153240', '-153240'],
        ['153240', '65000', '-65000'],
      ])
      expect(utc.starting_balance).toBe('0')
      // July differs by the pizza, #6: 31 July in São Paulo, 1 August in UTC.
      expect(utc.points.map((point: { balance: string }) => point.balance)).toEqual(['-73550', '-146750', '-65000'])
    }))

  test('the audit log: the corrected Feira, the deleted Lanche, and Bruno as the actor of his writes', () =>
    withRollback(async ({ app, db }) => {
      const summary = await runDemoSeed(db, { reset: false })
      const casa = await readSpace(app, summary, 'Casa (demo)')
      const bruno = summary.users.bruno.id
      const entriesFor = (id: string) => casa.audit.filter((entry) => entry.entity_type === 'transaction' && entry.entity_id === id)

      // #9: exactly one update, from 120.00 to 210.00 on both sides.
      const feira = casa.transactions.find((transaction) => transaction.name === 'Feira')!
      const feiraUpdates = entriesFor(feira.id).filter((entry) => entry.action === 'update')

      expect(feiraUpdates).toHaveLength(1)
      expect(feiraUpdates[0]!.before).toMatchObject({ from_value: '12000', to_value: '12000' })
      expect(feiraUpdates[0]!.after).toMatchObject({ from_value: '21000', to_value: '21000' })

      // #10: one create and one delete, and gone from the transaction list.
      const lancheEntries = casa.audit.filter((entry) => entry.entity_type === 'transaction' && (entry.after ?? entry.before)?.name === 'Lanche')

      expect(lancheEntries.map((entry) => entry.action).sort()).toEqual(['create', 'delete'])
      expect(new Set(lancheEntries.map((entry) => entry.entity_id)).size).toBe(1)
      expect(casa.transactions.some((transaction) => transaction.name === 'Lanche')).toBe(false)

      // The monthly Supermercado purchases are Bruno's, in the rows and in the log.
      const groceries = casa.transactions.filter((transaction) => transaction.name === 'Supermercado')

      expect(groceries).toHaveLength(3)

      for (const grocery of groceries) {
        expect(grocery.created_by).toBe(bruno)
        expect(entriesFor(grocery.id)).toEqual([expect.objectContaining({ action: 'create', actor_id: bruno })])
      }
    }))

  test('visibility: Carla sees no space, and Bruno, a viewer there, cannot write to Estúdio Ana', () =>
    withRollback(async ({ app, db }) => {
      const summary = await runDemoSeed(db, { reset: false })
      const estudio = await readSpace(app, summary, 'Estúdio Ana (demo)')
      const carla = await call(app, 'GET', '/v1/spaces', { user: summary.users.carla.id })
      const attempt = await call(app, 'POST', `/v1/spaces/${estudio.space.id}/transactions`, {
        user: summary.users.bruno.id,
        body: { name: 'Nope', from_account_id: estudio.account('Conta PJ').id, to_account_id: estudio.account('Contador').id, from_value: '100' },
      })

      expect(carla.body).toEqual({ data: [] })
      expect(attempt.status).toBe(403)
      expect((await call(app, 'GET', '/v1/spaces', { user: summary.users.bruno.id })).body.data.map((space: { role: string }) => space.role).sort()).toEqual([
        'editor',
        'viewer',
      ])
    }))

  test('refuses to run twice, and --reset recreates everything, twice in a row', () =>
    withRollback(async ({ db }) => {
      const first = await runDemoSeed(db, { reset: false })

      await expect(runDemoSeed(db, { reset: false })).rejects.toBeInstanceOf(DemoExistsError)

      const second = await runDemoSeed(db, { reset: true })
      const third = await runDemoSeed(db, { reset: true })
      const shape = (summary: DemoSummary) => summary.spaces.map(({ id: _id, ...space }) => space)

      expect(shape(second)).toEqual(shape(first))
      expect(shape(third)).toEqual(shape(first))
      expect(third.users.ana.id).not.toBe(first.users.ana.id)
      expect(shape(first)).toEqual([
        {
          name: 'Casa (demo)',
          accounts: { managed: 5, unmanaged: 9, system: 2 },
          transactions: 32,
          totals: [
            { currency: 'BRL', balance: '3077710' },
            { currency: 'USD', balance: '15000' },
          ],
        },
        {
          name: 'Estúdio Ana (demo)',
          accounts: { managed: 2, unmanaged: 4, system: 2 },
          transactions: 6,
          totals: [
            { currency: 'BRL', balance: '1203000' },
            { currency: 'USD', balance: '20000' },
          ],
        },
      ])
    }))
})
