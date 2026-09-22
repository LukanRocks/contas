import { z } from 'zod'
import { CurrencyCode } from './currencies.ts'
import { boundedName, SignedMinorUnits, Timestamp, UtcTimestamp, Uuid } from './primitives.ts'

export const AccountKind = z.enum(['managed', 'unmanaged', 'system']).meta({ id: 'AccountKind' })
export type AccountKind = z.infer<typeof AccountKind>

export const AccountName = boundedName(100)

export const Account = z
  .object({
    id: Uuid,
    space_id: Uuid,
    name: z.string(),
    kind: AccountKind,
    currency_code: CurrencyCode,
    system_key: z.string().nullable().meta({ description: "Set only on system accounts, e.g. 'opening_balance'." }),
    archived_at: Timestamp.nullable(),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: 'Account' })
export type Account = z.infer<typeof Account>

export const AccountList = z.object({ data: z.array(Account) }).meta({ id: 'AccountList' })
export type AccountList = z.infer<typeof AccountList>

export const OpeningBalance = z
  .strictObject({
    value: SignedMinorUnits.meta({
      description: 'Positive: money the account starts with. Negative: debt it starts with, e.g. a credit card. Zero records nothing.',
    }),
    occurred_at: UtcTimestamp.optional().meta({ description: 'Defaults to now.' }),
  })
  .meta({ id: 'OpeningBalance' })
export type OpeningBalance = z.infer<typeof OpeningBalance>

export const CreateAccount = z
  .strictObject({
    name: AccountName,
    kind: z.enum(['managed', 'unmanaged'], { error: 'Must be managed or unmanaged. System accounts are created by the server.' }),
    currency_code: CurrencyCode,
    opening_balance: OpeningBalance.optional().meta({
      description: "Managed accounts only. Recorded as a transaction against the space's Opening Balance account.",
    }),
  })
  .refine((body) => body.opening_balance === undefined || body.kind === 'managed', {
    path: ['opening_balance'],
    message: 'Only managed accounts have an opening balance.',
  })
  .meta({ id: 'CreateAccount' })
export type CreateAccount = z.infer<typeof CreateAccount>

export const UpdateAccount = z
  .strictObject({
    name: AccountName.optional(),
    currency_code: CurrencyCode.optional().meta({ description: 'Only while no transaction uses the account.' }),
    archived: z.boolean().optional().meta({ description: 'Archive an account instead of deleting one that transactions use.' }),
    // Named so it fails with a reason instead of as an unknown field: kind is the one attribute a client might expect to edit.
    kind: z
      .unknown()
      .refine(() => false, "An account's kind cannot be changed.")
      .optional()
      .meta({ description: 'Cannot be changed. Sending it is a 422.' }),
  })
  .refine(
    (body) => body.name !== undefined || body.currency_code !== undefined || body.archived !== undefined,
    'Send at least one of name, currency_code or archived.',
  )
  .meta({ id: 'UpdateAccount' })
export type UpdateAccount = z.infer<typeof UpdateAccount>

export const AccountListQuery = z.object({
  kind: AccountKind.optional(),
  currency: CurrencyCode.optional(),
  archived: z.enum(['false', 'true', 'all']).default('false').meta({ description: 'false (the default) lists active accounts, true archived ones, all both.' }),
})
export type AccountListQuery = z.infer<typeof AccountListQuery>
