import type { CreateTransaction, ProblemFieldError, Transaction, TransactionList, TransactionListQuery, UpdateTransaction } from '@contas/contracts'
import { and, desc, eq, gte, ilike, inArray, lt, or, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database } from '../../db/client.ts'
import { accounts, transactions } from '../../db/schema.ts'
import { writeAudit } from '../../lib/audit.ts'
import { afterCursor, cursorTimestamp, decodeCursor, page } from '../../lib/cursor.ts'
import { notFound, validationError } from '../../lib/errors.ts'
import { newId } from '../../lib/ids.ts'
import { formatMinorUnits, parseMinorUnits } from '../../lib/money.ts'
import type { Actor } from '../../lib/router.ts'

type TransactionRow = typeof transactions.$inferSelect
type AccountRow = typeof accounts.$inferSelect

/** Each value is in its own account's currency, so both currencies travel with the transaction. */
export const toTransaction = (row: TransactionRow, fromCurrency: string, toCurrency: string): Transaction => ({
  id: row.id,
  space_id: row.spaceId,
  name: row.name,
  from_account_id: row.fromAccountId,
  from_value: formatMinorUnits(row.fromValue),
  from_currency: fromCurrency,
  to_account_id: row.toAccountId,
  to_value: formatMinorUnits(row.toValue),
  to_currency: toCurrency,
  occurred_at: row.occurredAt.toISOString(),
  notes: row.notes,
  created_by: row.createdBy,
  created_at: row.createdAt.toISOString(),
  updated_at: row.updatedAt.toISOString(),
})

const audit = (tx: Database, action: 'create' | 'update' | 'delete', before: Transaction | null, after: Transaction | null, actor: Actor) => {
  const transaction = (after ?? before)!

  return writeAudit(tx, { spaceId: transaction.space_id, entityType: 'transaction', entityId: transaction.id, action, before, after, actor })
}

type Side = { id: string; currencyCode: string }

export type NewTransaction = {
  spaceId: string
  name: string
  from: Side
  to: Side
  fromValue: bigint
  toValue: bigint
  occurredAt: Date
  notes: string | null
}

/**
 * Writes a transaction the caller has already validated, and audits it.
 * Opening balances come through here directly. Client transactions pass `createTransaction`'s rule check first.
 */
export async function insertTransaction(tx: Database, input: NewTransaction, actor: Actor): Promise<Transaction> {
  const [row] = await tx
    .insert(transactions)
    .values({
      id: newId(),
      spaceId: input.spaceId,
      name: input.name,
      fromAccountId: input.from.id,
      toAccountId: input.to.id,
      fromValue: input.fromValue,
      toValue: input.toValue,
      occurredAt: input.occurredAt,
      notes: input.notes,
      createdBy: actor.id,
    })
    .returning()
  const transaction = toTransaction(row!, input.from.currencyCode, input.to.currencyCode)

  await audit(tx, 'create', null, transaction, actor)

  return transaction
}

/**
 * The two accounts a transaction would use, locked FOR SHARE until the transaction ends.
 * That blocks an account's currency from changing while the values are checked against it,
 * but lets other transactions use the same accounts at the same time.
 */
async function lockAccounts(tx: Database, spaceId: string, fromId: string, toId: string): Promise<{ from: AccountRow; to: AccountRow }> {
  const rows = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.spaceId, spaceId), inArray(accounts.id, [fromId, toId])))
    .for('share')
  const from = rows.find((row) => row.id === fromId)
  const to = rows.find((row) => row.id === toId)
  const missing: ProblemFieldError[] = []

  // Rule 1: both accounts belong to the transaction's space. The composite foreign keys enforce it too.
  if (!from) missing.push({ path: 'from_account_id', message: 'No account with this id in this space.' })
  if (!to) missing.push({ path: 'to_account_id', message: 'No account with this id in this space.' })
  if (!from || !to) throw validationError('The transaction refers to an account that is not in this space.', missing)

  return { from, to }
}

type Candidate = {
  fromAccountId: string
  toAccountId: string
  fromValue: bigint
  /** Only undefined on create, where it may default to fromValue. */
  toValue: bigint | undefined
}

/** What an update changes. The rules that only apply to new parts of a transaction read it. */
type Revision = {
  /** The currencies of the accounts the transaction used before the update. */
  fromCurrency: string
  toCurrency: string
  /** Whether the update points each side at a different account. */
  newFromAccount: boolean
  newToAccount: boolean
  /** Whether the update sent each value. */
  sentFromValue: boolean
  sentToValue: boolean
}

/**
 * §7.1, checked on create (`revision` null) and against the merged result of every update.
 * Returns the accounts and the value `to_value` resolves to.
 */
async function checkRules(tx: Database, spaceId: string, candidate: Candidate, revision: Revision | null) {
  // Rule 2: the two sides differ. A CHECK constraint enforces it too.
  if (candidate.fromAccountId === candidate.toAccountId) {
    throw validationError('A transaction moves value between two different accounts.', [
      { path: 'to_account_id', message: 'Must differ from from_account_id.' },
    ])
  }

  const { from, to } = await lockAccounts(tx, spaceId, candidate.fromAccountId, candidate.toAccountId)

  // Rule 3: at least one side is managed, which is what rules out unmanaged, system and mixed pairs without a managed account.
  if (from.kind !== 'managed' && to.kind !== 'managed') {
    throw validationError('At least one side of a transaction must be a managed account.', [
      { path: 'from_account_id', message: `"${from.name}" is ${from.kind}.` },
      { path: 'to_account_id', message: `"${to.name}" is ${to.kind}.` },
    ])
  }

  // Rule 6: an archived account may stay on a transaction, but no write may newly point at one.
  const archived: ProblemFieldError[] = []

  if ((revision?.newFromAccount ?? true) && from.archivedAt) archived.push({ path: 'from_account_id', message: `"${from.name}" is archived.` })
  if ((revision?.newToAccount ?? true) && to.archivedAt) archived.push({ path: 'to_account_id', message: `"${to.name}" is archived.` })
  if (archived.length > 0) throw validationError('A transaction cannot newly use an archived account.', archived)

  // Rule 7 carried over to updates, beyond the spec's letter: a side moved to an account of another currency needs its value restated.
  // Otherwise the old value would be kept and silently read in the new currency, recording an exchange that never happened.
  if (revision) {
    const restate: ProblemFieldError[] = []

    const change = (side: 'from' | 'to', before: string, after: string, verb: string) =>
      `Required: the ${side} account changes currency (${before} to ${after}), so send the value it ${verb} in ${after}.`

    if (from.currencyCode !== revision.fromCurrency && !revision.sentFromValue) {
      restate.push({ path: 'from_value', message: change('from', revision.fromCurrency, from.currencyCode, 'pays') })
    }

    if (to.currencyCode !== revision.toCurrency && !revision.sentToValue) {
      restate.push({ path: 'to_value', message: change('to', revision.toCurrency, to.currencyCode, 'receives') })
    }

    if (restate.length > 0) throw validationError('An account on this transaction changes currency, so its value must be sent again.', restate)
  }

  const fromValue = formatMinorUnits(candidate.fromValue)

  if (from.currencyCode === to.currencyCode) {
    // Rules 4 and 7: one currency means one value, and to_value defaults to it on create.
    if (candidate.toValue !== undefined && candidate.toValue !== candidate.fromValue) {
      throw validationError(`Accounts share currency ${from.currencyCode} but values differ.`, [
        { path: 'to_value', message: `Must equal from_value (${fromValue}).` },
      ])
    }

    return { from, to, toValue: candidate.fromValue }
  }

  // Rule 7: across currencies both values are required, since together they record the exchange.
  if (candidate.toValue === undefined) {
    throw validationError(`The accounts use different currencies (${from.currencyCode} to ${to.currencyCode}), so to_value is required.`, [
      { path: 'to_value', message: `Required: the value received, in ${to.currencyCode}.` },
    ])
  }

  return { from, to, toValue: candidate.toValue }
}

export async function createTransaction(tx: Database, spaceId: string, input: CreateTransaction, actor: Actor): Promise<Transaction> {
  const fromValue = parseMinorUnits(input.from_value)
  const { from, to, toValue } = await checkRules(
    tx,
    spaceId,
    {
      fromAccountId: input.from_account_id,
      toAccountId: input.to_account_id,
      fromValue,
      toValue: input.to_value === undefined ? undefined : parseMinorUnits(input.to_value),
    },
    null,
  )

  return insertTransaction(
    tx,
    {
      spaceId,
      name: input.name,
      from,
      to,
      fromValue,
      toValue,
      // Rule 8: occurred_at defaults to now.
      occurredAt: input.occurred_at ? new Date(input.occurred_at) : new Date(),
      notes: input.notes ?? null,
    },
    actor,
  )
}

const fromAccount = alias(accounts, 'from_account')
const toAccount = alias(accounts, 'to_account')

/** Transactions with both accounts' currencies, and each row's cursor position. */
const transactionQuery = (db: Database) =>
  db
    .select({
      transaction: transactions,
      fromCurrency: fromAccount.currencyCode,
      toCurrency: toAccount.currencyCode,
      cursorAt: cursorTimestamp(transactions.occurredAt),
    })
    .from(transactions)
    .innerJoin(fromAccount, eq(fromAccount.id, transactions.fromAccountId))
    .innerJoin(toAccount, eq(toAccount.id, transactions.toAccountId))

async function findTransaction(db: Database, spaceId: string, id: string, lock = false): Promise<Transaction> {
  const query = transactionQuery(db).where(and(eq(transactions.spaceId, spaceId), eq(transactions.id, id)))
  const [row] = lock ? await query.for('update', { of: transactions }) : await query

  if (!row) throw notFound('No such transaction in this space.')

  return toTransaction(row.transaction, row.fromCurrency, row.toCurrency)
}

export const getTransaction = (db: Database, spaceId: string, id: string) => findTransaction(db, spaceId, id)

/** `%` and `_` in the search text match themselves, not any characters. */
const containing = (text: string) => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`

/** Newest first, by (occurred_at, id), so rows sharing a timestamp still page in a stable order. */
export async function listTransactions(db: Database, spaceId: string, query: TransactionListQuery): Promise<TransactionList> {
  const filters: SQL[] = [eq(transactions.spaceId, spaceId)]

  if (query.account_id) filters.push(or(eq(transactions.fromAccountId, query.account_id), eq(transactions.toAccountId, query.account_id))!)
  if (query.from) filters.push(gte(transactions.occurredAt, new Date(query.from)))
  if (query.to) filters.push(lt(transactions.occurredAt, new Date(query.to)))
  if (query.q) filters.push(ilike(transactions.name, containing(query.q)))
  if (query.cursor) filters.push(afterCursor(transactions.occurredAt, transactions.id, decodeCursor(query.cursor)))

  const rows = await transactionQuery(db)
    .where(and(...filters))
    .orderBy(desc(transactions.occurredAt), desc(transactions.id))
    .limit(query.limit + 1)
  const { rows: kept, nextCursor } = page(rows, query.limit, (row) => ({ at: row.cursorAt, id: row.transaction.id }))

  return { data: kept.map((row) => toTransaction(row.transaction, row.fromCurrency, row.toCurrency)), next_cursor: nextCursor }
}

export async function updateTransaction(tx: Database, spaceId: string, id: string, input: UpdateTransaction, actor: Actor): Promise<Transaction> {
  const before = await findTransaction(tx, spaceId, id, true)
  const fromAccountId = input.from_account_id ?? before.from_account_id
  const toAccountId = input.to_account_id ?? before.to_account_id
  const fromValue = parseMinorUnits(input.from_value ?? before.from_value)
  const { toValue } = await checkRules(
    tx,
    spaceId,
    { fromAccountId, toAccountId, fromValue, toValue: parseMinorUnits(input.to_value ?? before.to_value) },
    {
      fromCurrency: before.from_currency,
      toCurrency: before.to_currency,
      newFromAccount: fromAccountId !== before.from_account_id,
      newToAccount: toAccountId !== before.to_account_id,
      sentFromValue: input.from_value !== undefined,
      sentToValue: input.to_value !== undefined,
    },
  )

  const [row] = await tx
    .update(transactions)
    .set({
      name: input.name,
      fromAccountId,
      toAccountId,
      fromValue,
      toValue,
      occurredAt: input.occurred_at === undefined ? undefined : new Date(input.occurred_at),
      notes: input.notes,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, id))
    .returning()
  const after = await findTransaction(tx, spaceId, row!.id)

  await audit(tx, 'update', before, after, actor)

  return after
}

export async function deleteTransaction(tx: Database, spaceId: string, id: string, actor: Actor): Promise<void> {
  const before = await findTransaction(tx, spaceId, id, true)

  await tx.delete(transactions).where(eq(transactions.id, id))
  await audit(tx, 'delete', before, null, actor)
}
