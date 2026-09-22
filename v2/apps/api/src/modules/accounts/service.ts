import type { Account, AccountListQuery, CreateAccount, UpdateAccount } from '@contas/contracts'
import { and, eq, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { accounts, transactions } from '../../db/schema.ts'
import { writeAudit } from '../../lib/audit.ts'
import { conflict, forbidden, notFound, validationError } from '../../lib/errors.ts'
import { newId } from '../../lib/ids.ts'
import { parseMinorUnits } from '../../lib/money.ts'
import type { Actor } from '../../lib/router.ts'
import { currencyExists } from '../currencies/service.ts'
import { insertTransaction } from '../transactions/service.ts'

export type AccountRow = typeof accounts.$inferSelect

export const OPENING_BALANCE = 'opening_balance'

export const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  space_id: row.spaceId,
  name: row.name,
  kind: row.kind,
  currency_code: row.currencyCode,
  system_key: row.systemKey,
  archived_at: row.archivedAt?.toISOString() ?? null,
  created_at: row.createdAt.toISOString(),
  updated_at: row.updatedAt.toISOString(),
})

const audit = (tx: Database, action: 'create' | 'update' | 'delete', before: Account | null, after: Account | null, actor: Actor) => {
  const account = (after ?? before)!

  return writeAudit(tx, { spaceId: account.space_id, entityType: 'account', entityId: account.id, action, before, after, actor })
}

/** Active accounts by default. Ordered by name. */
export async function listAccounts(db: Database, spaceId: string, query: AccountListQuery): Promise<Account[]> {
  const filters: SQL[] = [eq(accounts.spaceId, spaceId)]

  if (query.kind) filters.push(eq(accounts.kind, query.kind))
  if (query.currency) filters.push(eq(accounts.currencyCode, query.currency))
  if (query.archived === 'false') filters.push(isNull(accounts.archivedAt))
  if (query.archived === 'true') filters.push(isNotNull(accounts.archivedAt))

  const rows = await db
    .select()
    .from(accounts)
    .where(and(...filters))
    .orderBy(sql`lower(${accounts.name})`, accounts.id)

  return rows.map(toAccount)
}

/** An account of this space, or a 404. With `lock`, the row stays locked for the rest of the transaction. */
export async function findAccount(db: Database, spaceId: string, id: string, lock = false): Promise<AccountRow> {
  const query = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.spaceId, spaceId), eq(accounts.id, id)))
  const [row] = lock ? await query.for('update') : await query

  if (!row) throw notFound('No such account in this space.')

  return row
}

export async function getAccount(db: Database, spaceId: string, id: string): Promise<Account> {
  return toAccount(await findAccount(db, spaceId, id))
}

const RESERVED_NAME = /^opening balance ([a-z]{3})$/i

/**
 * "Opening Balance <code>" belongs to the system account for that currency, in any capitalisation.
 * Reserving it up front means creating that system account can never collide with a client's account name.
 */
async function assertNameNotReserved(db: Database, name: string): Promise<void> {
  const code = RESERVED_NAME.exec(name)?.[1]?.toUpperCase()

  if (code && (await currencyExists(db, code))) throw conflict(`"${name}" is reserved for the system account that holds opening balances in ${code}.`)
}

/** Names are unique per space regardless of case, like the accounts_space_name_uq index. */
async function assertNameFree(db: Database, spaceId: string, name: string, exceptId?: string): Promise<void> {
  const [clash] = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.spaceId, spaceId), sql`lower(${accounts.name}) = lower(${name})`, exceptId ? ne(accounts.id, exceptId) : undefined))

  if (clash) throw conflict(`This space already has an account named "${clash.name}".`)
}

async function assertCurrencyKnown(db: Database, code: string): Promise<void> {
  if (await currencyExists(db, code)) return

  throw validationError('Unknown currency.', [{ path: 'currency_code', message: `${code} is not a currency this API knows. See GET /v1/currencies.` }])
}

async function isUsedByTransactions(db: Database, accountId: string): Promise<boolean> {
  const [used] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(or(eq(transactions.fromAccountId, accountId), eq(transactions.toAccountId, accountId)))
    .limit(1)

  return used !== undefined
}

/**
 * The space's Opening Balance account for `currency`, created on first need and audited when it is.
 * The conflict target is the partial system-account index itself, so this can only ever skip an existing system account.
 * A clash on the name index would still raise, but reserved names keep clients from taking it.
 */
export async function ensureOpeningBalanceAccount(tx: Database, spaceId: string, currency: string, actor: Actor): Promise<AccountRow> {
  const [created] = await tx
    .insert(accounts)
    .values({ id: newId(), spaceId, name: `Opening Balance ${currency}`, kind: 'system', currencyCode: currency, systemKey: OPENING_BALANCE })
    .onConflictDoNothing({ target: [accounts.spaceId, accounts.systemKey, accounts.currencyCode], where: sql`${accounts.systemKey} IS NOT NULL` })
    .returning()

  if (created) {
    await audit(tx, 'create', null, toAccount(created), actor)

    return created
  }

  const [existing] = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.spaceId, spaceId), eq(accounts.systemKey, OPENING_BALANCE), eq(accounts.currencyCode, currency)))

  return existing!
}

/**
 * Creates a managed or unmanaged account.
 * A managed one also gets its currency's Opening Balance account, and its opening balance, if any, as a transaction against it.
 */
export async function createAccount(tx: Database, spaceId: string, input: CreateAccount, actor: Actor): Promise<Account> {
  await assertCurrencyKnown(tx, input.currency_code)
  await assertNameNotReserved(tx, input.name)
  await assertNameFree(tx, spaceId, input.name)

  const [row] = await tx.insert(accounts).values({ id: newId(), spaceId, name: input.name, kind: input.kind, currencyCode: input.currency_code }).returning()
  const account = row!

  await audit(tx, 'create', null, toAccount(account), actor)

  if (account.kind !== 'managed') return toAccount(account)

  const system = await ensureOpeningBalanceAccount(tx, spaceId, account.currencyCode, actor)
  const value = parseMinorUnits(input.opening_balance?.value ?? '0')

  if (value !== 0n) {
    // Money the account starts with flows in from the system account, debt it starts with flows out to it.
    const [from, to] = value > 0n ? [system, account] : [account, system]
    const amount = value > 0n ? value : -value

    await insertTransaction(
      tx,
      {
        spaceId,
        name: 'Opening balance',
        from,
        to,
        fromValue: amount,
        toValue: amount,
        occurredAt: input.opening_balance?.occurred_at ? new Date(input.opening_balance.occurred_at) : new Date(),
        notes: null,
      },
      actor,
    )
  }

  return toAccount(account)
}

export async function updateAccount(tx: Database, spaceId: string, id: string, input: UpdateAccount, actor: Actor): Promise<Account> {
  const current = await findAccount(tx, spaceId, id, true)

  if (current.kind === 'system') throw forbidden('System accounts are managed by the server and cannot be changed.')

  const changes: Partial<AccountRow> = { updatedAt: new Date() }

  if (input.name !== undefined) {
    await assertNameNotReserved(tx, input.name)
    await assertNameFree(tx, spaceId, input.name, id)
    changes.name = input.name
  }

  if (input.currency_code !== undefined && input.currency_code !== current.currencyCode) {
    await assertCurrencyKnown(tx, input.currency_code)

    // The account row is locked above, and a new transaction must lock it too (its foreign key does), so this check cannot go stale.
    if (await isUsedByTransactions(tx, id)) throw conflict('The currency of an account that transactions use cannot change.')

    changes.currencyCode = input.currency_code
  }

  // Archiving an archived account keeps the original date.
  if (input.archived === true && current.archivedAt === null) changes.archivedAt = new Date()
  if (input.archived === false) changes.archivedAt = null

  const [row] = await tx.update(accounts).set(changes).where(eq(accounts.id, id)).returning()
  const updated = row!

  await audit(tx, 'update', toAccount(current), toAccount(updated), actor)

  if (updated.kind === 'managed' && changes.currencyCode) await ensureOpeningBalanceAccount(tx, spaceId, updated.currencyCode, actor)

  return toAccount(updated)
}

/** Refused for accounts that transactions use. Those can be archived instead. */
export async function deleteAccount(tx: Database, spaceId: string, id: string, actor: Actor): Promise<void> {
  const current = await findAccount(tx, spaceId, id, true)

  if (current.kind === 'system') throw forbidden('System accounts are managed by the server and cannot be deleted.')
  if (await isUsedByTransactions(tx, id)) throw conflict('Transactions use this account, so it cannot be deleted. Archive it instead.')

  await tx.delete(accounts).where(eq(accounts.id, id))
  await audit(tx, 'delete', toAccount(current), null, actor)
}
