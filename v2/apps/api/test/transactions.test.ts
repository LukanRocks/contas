import { describe, expect, test } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'
import { accounts, transactions } from '../src/db/schema.ts'
import { newId } from '../src/lib/ids.ts'
import { auditOf, call, createAccount, createSpace, createTransaction, sqlStateOf, withRollback } from './helpers.ts'
import { createLedger } from './ledger.ts'

const transactionsOf = (sid: string) => `/v1/spaces/${sid}/transactions`
const transactionAt = (sid: string, id: string) => `/v1/spaces/${sid}/transactions/${id}`

const ABOVE_2_53 = '9007199254740993'

describe('POST /v1/spaces/:sid/transactions', () => {
  test('records a transaction between accounts of one currency, to_value defaulting to from_value (rule 7)', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const res = await call(app, 'POST', transactionsOf(space.id), {
        user: editor.id,
        body: {
          name: 'Feira',
          from_account_id: nubank.id,
          to_account_id: market.id,
          from_value: '12000',
          occurred_at: '2026-08-18T15:00:00Z',
          notes: 'Frutas',
        },
      })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        id: expect.any(String),
        space_id: space.id,
        name: 'Feira',
        from_account_id: nubank.id,
        from_value: '12000',
        from_currency: 'BRL',
        to_account_id: market.id,
        to_value: '12000',
        to_currency: 'BRL',
        occurred_at: '2026-08-18T15:00:00.000Z',
        notes: 'Frutas',
        created_by: editor.id,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      })

      const [row] = await auditOf(db, 'transaction', res.body.id)

      expect(row).toMatchObject({ spaceId: space.id, action: 'create', before: null, after: res.body, actorId: editor.id })
    }))

  test('records an exchange across currencies with both values', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, amazonUs } = await createLedger(db)
      const res = await call(app, 'POST', transactionsOf(space.id), {
        user: editor.id,
        body: { name: 'Teclado', from_account_id: nubank.id, to_account_id: amazonUs.id, from_value: '50000', to_value: '9200' },
      })

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ from_value: '50000', from_currency: 'BRL', to_value: '9200', to_currency: 'USD' })
    }))

  test('accepts equal values across currencies', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, wise, nubank } = await createLedger(db)
      const res = await call(app, 'POST', transactionsOf(space.id), {
        user: editor.id,
        body: { name: 'Par', from_account_id: wise.id, to_account_id: nubank.id, from_value: '100', to_value: '100' },
      })

      expect(res.status).toBe(201)
    }))

  test('is 422 across currencies without to_value (rule 7)', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, amazonUs } = await createLedger(db)
      const res = await call(app, 'POST', transactionsOf(space.id), {
        user: editor.id,
        body: { name: 'Teclado', from_account_id: nubank.id, to_account_id: amazonUs.id, from_value: '50000' },
      })

      expect(res.status).toBe(422)
      expect(res.body.errors).toEqual([{ path: 'to_value', message: expect.stringContaining('USD') }])
    }))

  test('is 422 when accounts share a currency but the values differ (rule 4)', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const res = await call(app, 'POST', transactionsOf(space.id), {
        user: editor.id,
        body: { name: 'Feira', from_account_id: nubank.id, to_account_id: market.id, from_value: '12345', to_value: '12300' },
      })

      expect(res.status).toBe(422)
      expect(res.headers.get('content-type')).toBe('application/problem+json')
      expect(res.body).toEqual({
        type: 'about:blank',
        title: 'Validation failed',
        status: 422,
        code: 'validation_error',
        detail: 'Accounts share currency BRL but values differ.',
        errors: [{ path: 'to_value', message: 'Must equal from_value (12345).' }],
      })
    }))

  test('is 422 for an account of another space, or none at all (rule 1)', () =>
    withRollback(async ({ app, db }) => {
      const { owner, editor, space, nubank } = await createLedger(db)
      const other = await createSpace(db, owner, 'Other')
      const elsewhere = await createAccount(db, other, owner, { name: 'Elsewhere', kind: 'unmanaged' })

      for (const [to, from] of [
        [elsewhere.id, nubank.id],
        [newId(), nubank.id],
      ]) {
        const body = { name: 'X', from_account_id: from, to_account_id: to, from_value: '100' }
        const res = await call(app, 'POST', transactionsOf(space.id), { user: editor.id, body })

        expect(res.status).toBe(422)
        expect(res.body.errors).toEqual([{ path: 'to_account_id', message: 'No account with this id in this space.' }])
      }
    }))

  test('is 422 from an account to itself (rule 2)', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank } = await createLedger(db)
      const body = { name: 'X', from_account_id: nubank.id, to_account_id: nubank.id, from_value: '100' }
      const res = await call(app, 'POST', transactionsOf(space.id), { user: editor.id, body })

      expect(res.status).toBe(422)
      expect(res.body.errors).toEqual([{ path: 'to_account_id', message: 'Must differ from from_account_id.' }])
    }))

  describe('at least one side is managed (rule 3)', () => {
    const allowed = [
      ['system → managed', 'openingBrl', 'nubank'],
      ['managed → system', 'nubank', 'openingBrl'],
      ['managed → unmanaged', 'nubank', 'market'],
      ['unmanaged → managed', 'market', 'nubank'],
      ['managed → managed', 'nubank', 'savings'],
    ] as const
    const refused = [
      ['unmanaged → unmanaged', 'market', 'ifood'],
      ['system → unmanaged', 'openingBrl', 'market'],
      ['unmanaged → system', 'market', 'openingBrl'],
      ['system → system', 'openingBrl', 'openingUsd'],
    ] as const

    for (const [label, from, to] of allowed) {
      test(`allows ${label}`, () =>
        withRollback(async ({ app, db }) => {
          const ledger = await createLedger(db)
          const body = { name: label, from_account_id: ledger[from].id, to_account_id: ledger[to].id, from_value: '100', to_value: '100' }

          expect((await call(app, 'POST', transactionsOf(ledger.space.id), { user: ledger.editor.id, body })).status).toBe(201)
        }))
    }

    for (const [label, from, to] of refused) {
      test(`refuses ${label}`, () =>
        withRollback(async ({ app, db }) => {
          const ledger = await createLedger(db)
          const body = { name: label, from_account_id: ledger[from].id, to_account_id: ledger[to].id, from_value: '100', to_value: '100' }
          const res = await call(app, 'POST', transactionsOf(ledger.space.id), { user: ledger.editor.id, body })

          expect(res.status).toBe(422)
          expect(res.body.detail).toBe('At least one side of a transaction must be a managed account.')
        }))
    }
  })

  for (const [label, from_value] of [
    ['zero', '0'],
    ['a negative value', '-100'],
    ['a decimal', '120.00'],
    ['a leading zero', '0120'],
    ['a JSON number', 12000],
    ['a value past the 64-bit range', '9223372036854775808'],
  ] as const) {
    test(`is 422 for ${label} (rule 5)`, () =>
      withRollback(async ({ app, db }) => {
        const { editor, space, nubank, market } = await createLedger(db)
        const body = { name: 'X', from_account_id: nubank.id, to_account_id: market.id, from_value }
        const res = await call(app, 'POST', transactionsOf(space.id), { user: editor.id, body })

        expect(res.status).toBe(422)
        expect(res.body.errors[0].path).toBe('from_value')
      }))
  }

  test('keeps values above 2^53 exact (rule 5)', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const res = await call(app, 'POST', transactionsOf(space.id), {
        user: editor.id,
        body: { name: 'Big', from_account_id: nubank.id, to_account_id: market.id, from_value: ABOVE_2_53 },
      })
      const [row] = await db.select().from(transactions).where(eq(transactions.id, res.body.id))

      expect(res.body).toMatchObject({ from_value: ABOVE_2_53, to_value: ABOVE_2_53 })
      expect(row!.fromValue).toBe(9007199254740993n)
      expect((await call(app, 'GET', transactionAt(space.id, res.body.id), { user: editor.id })).body.to_value).toBe(ABOVE_2_53)
    }))

  test('is 422 for an archived account on either side (rule 6)', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, oldBank, market } = await createLedger(db)

      for (const [from, to, path] of [
        [oldBank.id, market.id, 'from_account_id'],
        [market.id, oldBank.id, 'to_account_id'],
      ]) {
        const body = { name: 'X', from_account_id: from, to_account_id: to, from_value: '100' }
        const res = await call(app, 'POST', transactionsOf(space.id), { user: editor.id, body })

        expect(res.status).toBe(422)
        expect(res.body.errors).toEqual([{ path, message: '"Banco Antigo" is archived.' }])
      }
    }))

  test('occurred_at defaults to now (rule 8), and keeps milliseconds when sent', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const before = Date.now()
      const defaulted = await call(app, 'POST', transactionsOf(space.id), {
        user: editor.id,
        body: { name: 'Now', from_account_id: nubank.id, to_account_id: market.id, from_value: '1' },
      })
      const precise = await call(app, 'POST', transactionsOf(space.id), {
        user: editor.id,
        body: { name: 'Then', from_account_id: nubank.id, to_account_id: market.id, from_value: '1', occurred_at: '2026-08-01T01:30:00.250Z' },
      })

      expect(Date.parse(defaulted.body.occurred_at)).toBeGreaterThanOrEqual(before)
      expect(Date.parse(defaulted.body.occurred_at)).toBeLessThanOrEqual(Date.now())
      expect(precise.body.occurred_at).toBe('2026-08-01T01:30:00.250Z')
    }))

  test('is 422 for a local-time or offset-less occurred_at', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)

      for (const occurred_at of ['2026-07-31T22:30:00-03:00', '2026-07-31T22:30:00']) {
        const res = await call(app, 'POST', transactionsOf(space.id), {
          user: editor.id,
          body: { name: 'Pizza', from_account_id: nubank.id, to_account_id: market.id, from_value: '6490', occurred_at },
        })

        expect(res.status).toBe(422)
        expect(res.body.errors[0].path).toBe('occurred_at')
      }
    }))

  test('trims the name, and stores notes as sent', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const res = await call(app, 'POST', transactionsOf(space.id), {
        user: editor.id,
        body: { name: '  Feira ', from_account_id: nubank.id, to_account_id: market.id, from_value: '1', notes: '  two lines\nkept  ' },
      })

      expect(res.body).toMatchObject({ name: 'Feira', notes: '  two lines\nkept  ' })
    }))

  test('is 422 for a bad name, NUL in the notes, or an unknown field', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const base = { name: 'Feira', from_account_id: nubank.id, to_account_id: market.id, from_value: '1' }

      for (const [body, path] of [
        [{ ...base, name: '   ' }, 'name'],
        [{ ...base, name: 'x'.repeat(201) }, 'name'],
        [{ ...base, notes: `a${String.fromCharCode(0)}b` }, 'notes'],
        [{ ...base, created_by: editor.id }, 'created_by'],
      ] as const) {
        const res = await call(app, 'POST', transactionsOf(space.id), { user: editor.id, body })

        expect(res.status).toBe(422)
        expect(res.body.errors[0].path).toBe(path)
      }
    }))
})

describe('GET /v1/spaces/:sid/transactions/:id', () => {
  test('returns the transaction to any member', () =>
    withRollback(async ({ app, db }) => {
      const { owner, viewer, space, nubank, market } = await createLedger(db)
      const feira = await createTransaction(db, space, owner, { name: 'Feira', from_account_id: nubank.id, to_account_id: market.id, from_value: '12000' })

      expect((await call(app, 'GET', transactionAt(space.id, feira.id), { user: viewer.id })).body).toEqual(feira)
    }))

  test('is 404 for a transaction of another space', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createLedger(db)
      const other = await createSpace(db, owner, 'Other')
      const cash = await createAccount(db, other, owner, { name: 'Cash' })
      const shop = await createAccount(db, other, owner, { name: 'Shop', kind: 'unmanaged' })
      const elsewhere = await createTransaction(db, other, owner, { name: 'X', from_account_id: cash.id, to_account_id: shop.id, from_value: '1' })

      expect((await call(app, 'GET', transactionAt(space.id, elsewhere.id), { user: owner.id })).status).toBe(404)
      expect((await call(app, 'GET', transactionAt(space.id, 'nope'), { user: owner.id })).status).toBe(404)
    }))
})

describe('PATCH /v1/spaces/:sid/transactions/:id', () => {
  test('changes both values together and audits before and after', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const feira = await createTransaction(db, space, editor, { name: 'Feira', from_account_id: nubank.id, to_account_id: market.id, from_value: '12000' })
      const res = await call(app, 'PATCH', transactionAt(space.id, feira.id), { user: editor.id, body: { from_value: '21000', to_value: '21000' } })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ from_value: '21000', to_value: '21000', created_by: editor.id })

      const updates = (await auditOf(db, 'transaction', feira.id)).filter((row) => row.action === 'update')

      expect(updates).toHaveLength(1)
      expect(updates[0]).toMatchObject({
        before: expect.objectContaining({ from_value: '12000', to_value: '12000' }),
        after: expect.objectContaining({ from_value: '21000', to_value: '21000' }),
        actorId: editor.id,
      })
    }))

  test('checks the merged result: one value alone on a one-currency transaction is 422 (rule 4)', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const feira = await createTransaction(db, space, editor, { name: 'Feira', from_account_id: nubank.id, to_account_id: market.id, from_value: '12000' })
      const res = await call(app, 'PATCH', transactionAt(space.id, feira.id), { user: editor.id, body: { from_value: '21000' } })

      expect(res.status).toBe(422)
      expect(res.body.errors).toEqual([{ path: 'to_value', message: 'Must equal from_value (21000).' }])
    }))

  test('renames without touching anything else', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const feira = await createTransaction(db, space, editor, {
        name: 'Feira',
        from_account_id: nubank.id,
        to_account_id: market.id,
        from_value: '12000',
        notes: 'n',
      })
      const res = await call(app, 'PATCH', transactionAt(space.id, feira.id), { user: editor.id, body: { name: 'Feira livre' } })

      expect(res.body).toEqual({ ...feira, name: 'Feira livre', updated_at: expect.any(String) })
    }))

  test('clears the notes with null', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const feira = await createTransaction(db, space, editor, {
        name: 'Feira',
        from_account_id: nubank.id,
        to_account_id: market.id,
        from_value: '1',
        notes: 'n',
      })

      expect((await call(app, 'PATCH', transactionAt(space.id, feira.id), { user: editor.id, body: { notes: null } })).body.notes).toBeNull()
    }))

  test('moves to an account of another currency when the value it receives is given', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market, amazonUs } = await createLedger(db)
      const order = await createTransaction(db, space, editor, { name: 'Pedido', from_account_id: nubank.id, to_account_id: market.id, from_value: '50000' })
      const res = await call(app, 'PATCH', transactionAt(space.id, order.id), { user: editor.id, body: { to_account_id: amazonUs.id, to_value: '9200' } })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ to_account_id: amazonUs.id, to_value: '9200', to_currency: 'USD' })
    }))

  describe('moving a side to another currency needs its value restated', () => {
    /** 500.00 BRL paid for 92.00 USD. */
    const keyboard = (from: string, to: string) => ({ name: 'Teclado', from_account_id: from, to_account_id: to, from_value: '50000', to_value: '9200' })

    test('one currency to two: the to side needs to_value, instead of reading the old value in USD', () =>
      withRollback(async ({ app, db }) => {
        const { editor, space, nubank, market, amazonUs } = await createLedger(db)
        const order = await createTransaction(db, space, editor, { name: 'Pedido', from_account_id: nubank.id, to_account_id: market.id, from_value: '30000' })
        const res = await call(app, 'PATCH', transactionAt(space.id, order.id), { user: editor.id, body: { to_account_id: amazonUs.id } })

        expect(res.status).toBe(422)
        expect(res.body.errors).toEqual([
          { path: 'to_value', message: 'Required: the to account changes currency (BRL to USD), so send the value it receives in USD.' },
        ])
        expect((await call(app, 'GET', transactionAt(space.id, order.id), { user: editor.id })).body).toEqual(order)
      }))

    test('two currencies to another two: the to side needs to_value', () =>
      withRollback(async ({ app, db }) => {
        const { owner, editor, space, nubank, amazonUs } = await createLedger(db)
        const amazonDe = await createAccount(db, space, owner, { name: 'Amazon DE', kind: 'unmanaged', currency_code: 'EUR' })
        const order = await createTransaction(db, space, editor, keyboard(nubank.id, amazonUs.id))
        const patch = (body: object) => call(app, 'PATCH', transactionAt(space.id, order.id), { user: editor.id, body })

        expect((await patch({ to_account_id: amazonDe.id })).body.errors[0].path).toBe('to_value')
        expect((await patch({ to_account_id: amazonDe.id, to_value: '8500' })).status).toBe(200)
      }))

    test('two currencies back to one: asks for the value rather than reporting unequal values', () =>
      withRollback(async ({ app, db }) => {
        const { editor, space, nubank, market, amazonUs } = await createLedger(db)
        const order = await createTransaction(db, space, editor, keyboard(nubank.id, amazonUs.id))
        const patch = (body: object) => call(app, 'PATCH', transactionAt(space.id, order.id), { user: editor.id, body })

        const res = await patch({ to_account_id: market.id })

        expect(res.body.errors).toEqual([expect.objectContaining({ path: 'to_value', message: expect.stringContaining('USD to BRL') })])
        expect((await patch({ to_account_id: market.id, to_value: '50000' })).status).toBe(200)
      }))

    test('the from side needs from_value', () =>
      withRollback(async ({ app, db }) => {
        const { editor, space, nubank, market, wise } = await createLedger(db)
        const order = await createTransaction(db, space, editor, { name: 'Pedido', from_account_id: nubank.id, to_account_id: market.id, from_value: '30000' })
        const res = await call(app, 'PATCH', transactionAt(space.id, order.id), { user: editor.id, body: { from_account_id: wise.id } })

        expect(res.status).toBe(422)
        expect(res.body.errors).toEqual([expect.objectContaining({ path: 'from_value', message: expect.stringContaining('BRL to USD') })])
      }))

    test('both sides at once need both values', () =>
      withRollback(async ({ app, db }) => {
        const { editor, space, nubank, market, wise, amazonUs } = await createLedger(db)
        const order = await createTransaction(db, space, editor, { name: 'Pedido', from_account_id: nubank.id, to_account_id: market.id, from_value: '30000' })
        const body = { from_account_id: wise.id, to_account_id: amazonUs.id }
        const res = await call(app, 'PATCH', transactionAt(space.id, order.id), { user: editor.id, body })

        expect(res.body.errors.map((error: { path: string }) => error.path)).toEqual(['from_value', 'to_value'])
      }))

    test('switching between accounts of the same currency needs nothing more', () =>
      withRollback(async ({ app, db }) => {
        const { editor, space, nubank, savings, market, ifood } = await createLedger(db)
        const order = await createTransaction(db, space, editor, { name: 'Pedido', from_account_id: nubank.id, to_account_id: market.id, from_value: '30000' })
        const body = { from_account_id: savings.id, to_account_id: ifood.id }
        const res = await call(app, 'PATCH', transactionAt(space.id, order.id), { user: editor.id, body })

        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ from_value: '30000', to_value: '30000' })
      }))
  })

  for (const [label, change, path] of [
    ['both sides unmanaged (rule 3)', 'unmanaged', 'from_account_id'],
    ['the same account on both sides (rule 2)', 'self', 'to_account_id'],
    ['an account of another space (rule 1)', 'elsewhere', 'to_account_id'],
    ['an archived account (rule 6)', 'archived', 'to_account_id'],
  ] as const) {
    test(`is 422 when the merged result has ${label}`, () =>
      withRollback(async ({ app, db }) => {
        const { owner, editor, space, nubank, market, ifood, oldBank } = await createLedger(db)
        const other = await createSpace(db, owner, 'Other')
        const elsewhere = await createAccount(db, other, owner, { name: 'Elsewhere' })
        const feira = await createTransaction(db, space, editor, { name: 'Feira', from_account_id: nubank.id, to_account_id: market.id, from_value: '100' })
        const body = {
          unmanaged: { from_account_id: ifood.id },
          self: { to_account_id: nubank.id },
          elsewhere: { to_account_id: elsewhere.id },
          archived: { to_account_id: oldBank.id },
        }[change]
        const res = await call(app, 'PATCH', transactionAt(space.id, feira.id), { user: editor.id, body })

        expect(res.status).toBe(422)
        expect(res.body.errors.map((error: { path: string }) => error.path)).toContain(path)
      }))
  }

  test('may still edit a transaction that already uses an archived account (rule 6)', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const feira = await createTransaction(db, space, editor, { name: 'Feira', from_account_id: nubank.id, to_account_id: market.id, from_value: '100' })

      // Both sides archived, so neither side's check may look at an account the write does not change.
      await db.update(accounts).set({ archivedAt: new Date() }).where(inArray(accounts.id, [nubank.id, market.id]))

      for (const body of [{ name: 'Feira antiga' }, { from_value: '200', to_value: '200' }, { from_account_id: nubank.id, to_account_id: market.id }]) {
        expect((await call(app, 'PATCH', transactionAt(space.id, feira.id), { user: editor.id, body })).status).toBe(200)
      }
    }))

  test('is 422 for an empty body or a field that is not editable', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, market } = await createLedger(db)
      const feira = await createTransaction(db, space, editor, { name: 'Feira', from_account_id: nubank.id, to_account_id: market.id, from_value: '100' })

      expect((await call(app, 'PATCH', transactionAt(space.id, feira.id), { user: editor.id, body: {} })).status).toBe(422)

      for (const field of ['space_id', 'created_by', 'id']) {
        const res = await call(app, 'PATCH', transactionAt(space.id, feira.id), { user: editor.id, body: { [field]: editor.id } })

        expect(res.body.errors).toContainEqual({ path: field, message: 'Unknown field.' })
      }
    }))

  test('is 404 for an unknown transaction', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createLedger(db)

      expect((await call(app, 'PATCH', transactionAt(space.id, newId()), { user: editor.id, body: { name: 'X' } })).status).toBe(404)
    }))
})

describe('DELETE /v1/spaces/:sid/transactions/:id', () => {
  test('deletes the transaction and audits it', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space, nubank, ifood } = await createLedger(db)
      const lanche = await createTransaction(db, space, editor, { name: 'Lanche', from_account_id: nubank.id, to_account_id: ifood.id, from_value: '5000' })

      expect((await call(app, 'DELETE', transactionAt(space.id, lanche.id), { user: editor.id })).status).toBe(204)
      expect((await call(app, 'GET', transactionAt(space.id, lanche.id), { user: editor.id })).status).toBe(404)
      expect((await auditOf(db, 'transaction', lanche.id)).map((row) => row.action)).toEqual(['create', 'delete'])
      expect((await auditOf(db, 'transaction', lanche.id))[1]).toMatchObject({ before: lanche, after: null })
    }))

  test('is 404 for an unknown transaction', () =>
    withRollback(async ({ app, db }) => {
      const { editor, space } = await createLedger(db)

      expect((await call(app, 'DELETE', transactionAt(space.id, newId()), { user: editor.id })).status).toBe(404)
    }))
})

describe('the rules the database enforces on its own (§7.1, marked DB)', () => {
  test("both accounts belong to the transaction's space (rule 1)", () =>
    withRollback(async ({ db }) => {
      const { owner, space, nubank } = await createLedger(db)
      const other = await createSpace(db, owner, 'Other')
      const elsewhere = await createAccount(db, other, owner, { name: 'Elsewhere', kind: 'unmanaged' })
      const code = await sqlStateOf(db, (savepoint) =>
        savepoint.insert(transactions).values({
          id: newId(),
          spaceId: space.id,
          name: 'X',
          fromAccountId: nubank.id,
          toAccountId: elsewhere.id,
          fromValue: 1n,
          toValue: 1n,
          occurredAt: new Date(),
        }),
      )

      expect(code).toBe('23503')
    }))

  test('the two accounts differ (rule 2) and values are positive (rule 5)', () =>
    withRollback(async ({ db }) => {
      const { space, nubank, market } = await createLedger(db)
      const row = { spaceId: space.id, name: 'X', fromAccountId: nubank.id, toAccountId: market.id, fromValue: 1n, toValue: 1n, occurredAt: new Date() }

      expect(await sqlStateOf(db, (savepoint) => savepoint.insert(transactions).values({ ...row, id: newId(), toAccountId: nubank.id }))).toBe('23514')
      expect(await sqlStateOf(db, (savepoint) => savepoint.insert(transactions).values({ ...row, id: newId(), fromValue: 0n }))).toBe('23514')
      expect(await sqlStateOf(db, (savepoint) => savepoint.insert(transactions).values({ ...row, id: newId(), toValue: -1n }))).toBe('23514')
      expect(await sqlStateOf(db, (savepoint) => savepoint.insert(transactions).values({ ...row, id: newId() }))).toBeUndefined()
    }))
})
