import type { CreateAccount, CreateTransaction, Role, Space, User } from '@contas/contracts'
import { and, asc, eq, sql, TransactionRollbackError } from 'drizzle-orm'
import { createApp, type App } from '../src/app.ts'
import type { Database } from '../src/db/client.ts'
import { pgErrorCode } from '../src/lib/errors.ts'
import { auditLog } from '../src/db/schema.ts'
import type { Actor } from '../src/lib/router.ts'
import * as accounts from '../src/modules/accounts/service.ts'
import * as members from '../src/modules/members/service.ts'
import * as spaces from '../src/modules/spaces/service.ts'
import * as transactions from '../src/modules/transactions/service.ts'
import * as users from '../src/modules/users/service.ts'
import { testDb } from './db.ts'

export type TestContext = {
  /** An app whose every query runs inside the test's transaction. */
  app: App
  /** That same transaction, for setup and assertions below the HTTP layer. */
  db: Database
}

/**
 * Runs `fn` inside a transaction that is always rolled back, so tests never see
 * each other's rows. Transactions the services open become savepoints in it.
 */
export async function withRollback<Result>(fn: (context: TestContext) => Promise<Result>): Promise<Result> {
  let result!: Result
  try {
    await testDb.transaction(async (tx) => {
      result = await fn({ app: createApp({ db: tx }), db: tx })
      tx.rollback()
    })
  } catch (err) {
    if (!(err instanceof TransactionRollbackError)) throw err
  }
  return result
}

/**
 * For tests that must see committed state: `fn` runs against the real pool, and every table but currencies is emptied afterwards.
 * Nothing else in the suite commits, so this cannot disturb other tests.
 */
export async function withCommittedDb<Result>(fn: (context: TestContext) => Promise<Result>): Promise<Result> {
  try {
    return await fn({ app: createApp({ db: testDb }), db: testDb })
  } finally {
    await testDb.execute(sql`TRUNCATE users, spaces, space_members, accounts, transactions, audit_log CASCADE`)
  }
}

/**
 * Runs one statement in a savepoint and returns the SQLSTATE it failed with, or undefined if it succeeded.
 * For proving the rules the database enforces on its own. The savepoint keeps the test's transaction usable afterwards.
 */
export async function sqlStateOf(db: Database, statement: (savepoint: Database) => Promise<unknown>): Promise<string | undefined> {
  try {
    await db.transaction(async (savepoint) => {
      await statement(savepoint)
    })
  } catch (err) {
    return pgErrorCode(err) ?? 'not a Postgres error'
  }

  return undefined
}

export type CallOptions = {
  /** Sent as X-User-Id. */
  user?: string
  /** Serialised as JSON unless already a string (to send malformed bodies). */
  body?: unknown
  headers?: Record<string, string>
}

export type CallResult = {
  status: number
  headers: Headers
  /** Parsed when the response is JSON (including problem+json), null otherwise. */
  body: any
  text: string
}

/** One request through `app.request()`: no server, no network. */
export async function call(app: App, method: string, path: string, opts: CallOptions = {}): Promise<CallResult> {
  const headers: Record<string, string> = { ...opts.headers }
  if (opts.user !== undefined) headers['x-user-id'] = opts.user

  let body: string | undefined
  if (opts.body !== undefined) {
    headers['content-type'] ??= 'application/json'
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
  }

  const res = await app.request(path, { method, headers, body })
  const text = await res.text()
  const isJson = /json/.test(res.headers.get('content-type') ?? '')
  return { status: res.status, headers: res.headers, body: isJson && text ? JSON.parse(text) : null, text }
}

// ---------- factories ----------
// They go through the services, so the rows they make carry audit entries exactly like ones made through the API.

export const actorOf = (user: User): Actor => ({ id: user.id, name: user.name })

export const createUser = (db: Database, name = 'User') => users.createUser(db, { name }, null)

export const createSpace = (db: Database, owner: User, name = 'Space') => spaces.createSpace(db, { name }, actorOf(owner))

/** Adds `user` to the space as `role`, acting as the space's owner. */
export const addMember = (db: Database, space: Space, owner: User, user: User, role: Role) =>
  members.addMember(db, space.id, { user_id: user.id, role }, actorOf(owner))

/** An account in `space`, created as `actor`. Defaults to a managed BRL account with no opening balance. */
export const createAccount = (db: Database, space: Space, actor: User, input: Partial<CreateAccount> & { name: string }) =>
  accounts.createAccount(db, space.id, { kind: 'managed', currency_code: 'BRL', ...input } as CreateAccount, actorOf(actor))

/** A transaction in `space`, created as `actor` through the full rule check. */
export const createTransaction = (db: Database, space: Space, actor: User, input: CreateTransaction) =>
  transactions.createTransaction(db, space.id, input, actorOf(actor))

/** A space with one member of each role, plus a user who belongs to it in no way. */
export async function createCast(db: Database) {
  const owner = await createUser(db, 'Owner')
  const editor = await createUser(db, 'Editor')
  const viewer = await createUser(db, 'Viewer')
  const outsider = await createUser(db, 'Outsider')
  const space = await createSpace(db, owner, 'Cast')

  await addMember(db, space, owner, editor, 'editor')
  await addMember(db, space, owner, viewer, 'viewer')

  return { owner, editor, viewer, outsider, space }
}

/** Audit rows for one entity, oldest first. */
export const auditOf = (db: Database, entityType: (typeof auditLog.$inferSelect)['entityType'], entityId: string) =>
  db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .orderBy(asc(auditLog.at), asc(auditLog.id))
