import { z } from 'zod'
import { CurrencyCode } from './currencies.ts'
import { MinorUnits, Timestamp, Uuid } from './primitives.ts'

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
