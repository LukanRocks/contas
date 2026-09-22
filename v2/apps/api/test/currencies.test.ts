import { describe, expect, test } from 'bun:test'
import { ISO_4217 } from '../src/db/seed-currencies.ts'
import { call, createUser, withRollback } from './helpers.ts'

describe('GET /v1/currencies', () => {
  test('lists every seeded ISO 4217 currency, by code, with its minor units', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const res = await call(app, 'GET', '/v1/currencies', { user: ana.id })
      const codes = res.body.data.map((currency: { code: string }) => currency.code)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(ISO_4217.length)
      expect(codes).toEqual([...codes].sort())
      expect(res.body.data).toContainEqual({ code: 'BRL', name: 'Brazilian Real', minor_units: 2 })
      expect(res.body.data).toContainEqual({ code: 'JPY', name: 'Yen', minor_units: 0 })
      expect(res.body.data).toContainEqual({ code: 'KWD', name: 'Kuwaiti Dinar', minor_units: 3 })
    }))

  test('leaves out funds, metals and test codes', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')
      const codes = (await call(app, 'GET', '/v1/currencies', { user: ana.id })).body.data.map((currency: { code: string }) => currency.code)

      for (const code of ['CLF', 'UYI', 'XAU', 'XTS', 'XXX', 'XDR']) expect(codes).not.toContain(code)
    }))

  test('needs X-User-Id', () =>
    withRollback(async ({ app }) => {
      expect((await call(app, 'GET', '/v1/currencies')).status).toBe(401)
    }))
})
