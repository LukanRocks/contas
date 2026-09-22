import { describe, expect, test } from 'bun:test'
import type { Database } from '../src/db/client.ts'
import { addMember, call, createAccount, createCast, createTransaction, createUser, withRollback } from './helpers.ts'

type Cast = Awaited<ReturnType<typeof createCast>>
type Who = 'viewer' | 'editor' | 'owner' | 'outsider'
type Request = { method: string; path: string; body?: unknown }

type Case = {
  action: string
  /** Builds the request against a fresh cast. */
  request: (cast: Cast, db: Database) => Promise<Request>
  /** Who may do it. Everyone else in the space gets 403, and the outsider always gets 404. */
  allowed: Who[]
  /** What the allowed request answers with. */
  ok: number
}

/** A transaction between two new accounts of the cast's space. */
async function createFeira({ space, owner }: Cast, db: Database) {
  const nubank = await createAccount(db, space, owner, { name: 'Nubank' })
  const market = await createAccount(db, space, owner, { name: 'Supermercado', kind: 'unmanaged' })

  return createTransaction(db, space, owner, { name: 'Feira', from_account_id: nubank.id, to_account_id: market.id, from_value: '12000' })
}

const readers: Who[] = ['viewer', 'editor', 'owner']
const writers: Who[] = ['editor', 'owner']

// §8.2, for the actions that exist so far. The audit log joins in the next milestone.
const CASES: Case[] = [
  {
    action: 'read the space',
    request: async ({ space }) => ({ method: 'GET', path: `/v1/spaces/${space.id}` }),
    allowed: readers,
    ok: 200,
  },
  {
    action: 'list members',
    request: async ({ space }) => ({ method: 'GET', path: `/v1/spaces/${space.id}/members` }),
    allowed: readers,
    ok: 200,
  },
  {
    action: 'rename the space',
    request: async ({ space }) => ({ method: 'PATCH', path: `/v1/spaces/${space.id}`, body: { name: 'Renamed' } }),
    allowed: ['owner'],
    ok: 200,
  },
  {
    action: 'add a member',
    request: async ({ space }, db) => {
      const newcomer = await createUser(db, 'New')

      return { method: 'POST', path: `/v1/spaces/${space.id}/members`, body: { user_id: newcomer.id, role: 'viewer' } }
    },
    allowed: ['owner'],
    ok: 201,
  },
  {
    action: "change a member's role",
    request: async ({ space, viewer }) => ({ method: 'PATCH', path: `/v1/spaces/${space.id}/members/${viewer.id}`, body: { role: 'editor' } }),
    allowed: ['owner'],
    ok: 200,
  },
  {
    // Aimed at a member who is none of the cast, since removing yourself is allowed to everyone.
    action: 'remove another member',
    request: async ({ space, owner }, db) => {
      const other = await createUser(db, 'Other')

      await addMember(db, space, owner, other, 'viewer')

      return { method: 'DELETE', path: `/v1/spaces/${space.id}/members/${other.id}` }
    },
    allowed: ['owner'],
    ok: 204,
  },
  {
    action: 'list accounts',
    request: async ({ space }) => ({ method: 'GET', path: `/v1/spaces/${space.id}/accounts` }),
    allowed: readers,
    ok: 200,
  },
  {
    action: 'read an account',
    request: async ({ space, owner }, db) => {
      const account = await createAccount(db, space, owner, { name: 'Nubank' })

      return { method: 'GET', path: `/v1/spaces/${space.id}/accounts/${account.id}` }
    },
    allowed: readers,
    ok: 200,
  },
  {
    action: 'create an account',
    request: async ({ space }) => ({
      method: 'POST',
      path: `/v1/spaces/${space.id}/accounts`,
      body: { name: 'Nubank', kind: 'managed', currency_code: 'BRL' },
    }),
    allowed: writers,
    ok: 201,
  },
  {
    action: 'update an account',
    request: async ({ space, owner }, db) => {
      const account = await createAccount(db, space, owner, { name: 'Nubank' })

      return { method: 'PATCH', path: `/v1/spaces/${space.id}/accounts/${account.id}`, body: { archived: true } }
    },
    allowed: writers,
    ok: 200,
  },
  {
    action: 'delete an account',
    request: async ({ space, owner }, db) => {
      const account = await createAccount(db, space, owner, { name: 'Supermercado', kind: 'unmanaged' })

      return { method: 'DELETE', path: `/v1/spaces/${space.id}/accounts/${account.id}` }
    },
    allowed: writers,
    ok: 204,
  },
  {
    action: 'list transactions',
    request: async ({ space }) => ({ method: 'GET', path: `/v1/spaces/${space.id}/transactions` }),
    allowed: readers,
    ok: 200,
  },
  {
    action: 'read a transaction',
    request: async (cast, db) => {
      const transaction = await createFeira(cast, db)

      return { method: 'GET', path: `/v1/spaces/${cast.space.id}/transactions/${transaction.id}` }
    },
    allowed: readers,
    ok: 200,
  },
  {
    action: 'create a transaction',
    request: async ({ space, owner }, db) => {
      const nubank = await createAccount(db, space, owner, { name: 'Nubank' })
      const market = await createAccount(db, space, owner, { name: 'Supermercado', kind: 'unmanaged' })

      const body = { name: 'Feira', from_account_id: nubank.id, to_account_id: market.id, from_value: '12000' }

      return { method: 'POST', path: `/v1/spaces/${space.id}/transactions`, body }
    },
    allowed: writers,
    ok: 201,
  },
  {
    action: 'update a transaction',
    request: async (cast, db) => {
      const transaction = await createFeira(cast, db)

      return { method: 'PATCH', path: `/v1/spaces/${cast.space.id}/transactions/${transaction.id}`, body: { name: 'Feira livre' } }
    },
    allowed: writers,
    ok: 200,
  },
  {
    action: 'delete a transaction',
    request: async (cast, db) => {
      const transaction = await createFeira(cast, db)

      return { method: 'DELETE', path: `/v1/spaces/${cast.space.id}/transactions/${transaction.id}` }
    },
    allowed: writers,
    ok: 204,
  },
  {
    action: "read an account's balance",
    request: async ({ space, owner }, db) => {
      const account = await createAccount(db, space, owner, { name: 'Nubank' })

      return { method: 'GET', path: `/v1/spaces/${space.id}/accounts/${account.id}/balance` }
    },
    allowed: readers,
    ok: 200,
  },
  {
    // A POST, but a read: viewers may send it.
    action: "read an account's balance history",
    request: async ({ space, owner }, db) => {
      const account = await createAccount(db, space, owner, { name: 'Nubank' })

      const body = { edges: ['2026-06-01T03:00:00Z', '2026-07-01T03:00:00Z'] }

      return { method: 'POST', path: `/v1/spaces/${space.id}/accounts/${account.id}/balance-history`, body }
    },
    allowed: readers,
    ok: 200,
  },
  {
    action: "read the space's balances",
    request: async ({ space }) => ({ method: 'GET', path: `/v1/spaces/${space.id}/balances` }),
    allowed: readers,
    ok: 200,
  },
  {
    action: 'delete the space',
    request: async ({ space }) => ({ method: 'DELETE', path: `/v1/spaces/${space.id}` }),
    allowed: ['owner'],
    ok: 204,
  },
]

describe('space permissions (§8.2)', () => {
  for (const testCase of CASES) {
    for (const who of ['viewer', 'editor', 'owner', 'outsider'] as const) {
      const expected = who === 'outsider' ? 404 : testCase.allowed.includes(who) ? testCase.ok : 403

      test(`${who} → ${testCase.action}: ${expected}`, () =>
        withRollback(async ({ app, db }) => {
          const cast = await createCast(db)
          const { method, path, body } = await testCase.request(cast, db)
          const res = await call(app, method, path, { user: cast[who].id, body })

          expect(res.status).toBe(expected)
        }))
    }
  }
})
