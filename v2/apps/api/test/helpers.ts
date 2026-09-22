import { TransactionRollbackError } from 'drizzle-orm'
import { createApp, type App } from '../src/app.ts'
import type { Database } from '../src/db/client.ts'
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
export async function withRollback<T>(fn: (ctx: TestContext) => Promise<T>): Promise<T> {
  let result!: T
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
  /** Parsed when the response is JSON (including problem+json); null otherwise. */
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
