import { z } from 'zod'
import { CurrencyCode } from './currencies.ts'
import { boundedName, emptyAsAbsent, hasNoNul, MinorUnits, PageQuery, Timestamp, UtcTimestamp, Uuid } from './primitives.ts'

export const Transaction = z
  .object({
    id: Uuid,
    space_id: Uuid,
    name: z.string(),
    from_account_id: Uuid,
    from_value: MinorUnits.meta({ description: "Minor units of the from account's currency." }),
    from_currency: CurrencyCode,
    to_account_id: Uuid,
    to_value: MinorUnits.meta({ description: "Minor units of the to account's currency." }),
    to_currency: CurrencyCode,
    occurred_at: Timestamp,
    notes: z.string().nullable(),
    created_by: Uuid.nullable().meta({ description: 'Null once that user is deleted.' }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: 'Transaction' })
export type Transaction = z.infer<typeof Transaction>

export const TransactionName = boundedName(200)

/** Free text, stored as sent: not trimmed and not length-limited. */
export const TransactionNotes = z.string().refine(hasNoNul, 'Must not contain NUL characters.')

const fields = {
  name: TransactionName,
  from_account_id: Uuid,
  to_account_id: Uuid,
  from_value: MinorUnits.meta({ description: "Minor units of the from account's currency." }),
  to_value: MinorUnits.meta({ description: "Minor units of the to account's currency. Must equal from_value when both accounts share a currency." }),
  occurred_at: UtcTimestamp,
  notes: TransactionNotes.nullable(),
}

export const CreateTransaction = z
  .strictObject({
    ...fields,
    to_value: fields.to_value.optional().meta({ description: 'Defaults to from_value when both accounts share a currency. Required when they do not.' }),
    occurred_at: fields.occurred_at.optional().meta({ description: 'Defaults to now.' }),
    notes: fields.notes.optional(),
  })
  .meta({ id: 'CreateTransaction' })
export type CreateTransaction = z.infer<typeof CreateTransaction>

/**
 * Any subset of the create fields.
 * The result is checked as a whole, so changing from_value on a transaction between accounts of one currency needs to_value too.
 * Moving a side to an account of another currency needs that side's value too, so an old value is never read in a new currency.
 */
export const UpdateTransaction = z
  .strictObject({
    name: fields.name.optional(),
    from_account_id: fields.from_account_id.optional(),
    to_account_id: fields.to_account_id.optional(),
    from_value: fields.from_value.optional(),
    to_value: fields.to_value.optional(),
    occurred_at: fields.occurred_at.optional(),
    notes: fields.notes.optional().meta({ description: 'Send null to clear.' }),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), 'Send at least one field to change.')
  .meta({ id: 'UpdateTransaction' })
export type UpdateTransaction = z.infer<typeof UpdateTransaction>

export const TransactionList = z
  .object({
    data: z.array(Transaction),
    next_cursor: z.string().nullable().meta({ description: 'Pass as `cursor` for the next page. Null on the last page.' }),
  })
  .meta({ id: 'TransactionList' })
export type TransactionList = z.infer<typeof TransactionList>

export const TransactionListQuery = z.object({
  account_id: emptyAsAbsent(Uuid).meta({ description: 'Transactions from or to this account.' }),
  from: emptyAsAbsent(UtcTimestamp).meta({ description: 'occurred_at at or after this instant.' }),
  to: emptyAsAbsent(UtcTimestamp).meta({ description: 'occurred_at before this instant.' }),
  q: emptyAsAbsent(z.string()).meta({ description: 'Case-insensitive substring of the name.' }),
  ...PageQuery,
})
export type TransactionListQuery = z.infer<typeof TransactionListQuery>
