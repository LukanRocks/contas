import type { Transaction } from '@contas/contracts'
import type { Database } from '../../db/client.ts'
import { transactions } from '../../db/schema.ts'
import { writeAudit } from '../../lib/audit.ts'
import { newId } from '../../lib/ids.ts'
import { formatMinorUnits } from '../../lib/money.ts'
import type { Actor } from '../../lib/router.ts'

type TransactionRow = typeof transactions.$inferSelect

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
 * Opening balances come through here directly. Client transactions will pass the full rule check first.
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

  await writeAudit(tx, {
    spaceId: input.spaceId,
    entityType: 'transaction',
    entityId: transaction.id,
    action: 'create',
    before: null,
    after: transaction,
    actor,
  })

  return transaction
}
