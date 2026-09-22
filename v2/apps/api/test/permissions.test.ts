import { describe, expect, test } from 'bun:test'
import type { Database } from '../src/db/client.ts'
import { addMember, call, createCast, createUser, withRollback } from './helpers.ts'

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

const readers: Who[] = ['viewer', 'editor', 'owner']

// §8.2, for the actions that exist so far. Accounts, transactions, balances and the audit log join as they land.
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
