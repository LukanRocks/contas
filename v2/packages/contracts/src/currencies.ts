import { z } from 'zod'

/** An ISO 4217 code, in capitals. Whether the API knows it is checked against GET /v1/currencies. */
export const CurrencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Must be a three-letter ISO 4217 code in capitals, e.g. BRL.')
  .meta({ example: 'BRL' })

export const Currency = z
  .object({
    code: CurrencyCode,
    name: z.string(),
    minor_units: z.number().int().meta({ description: 'Digits after the decimal point: 2 for BRL, 0 for JPY, 3 for KWD.' }),
  })
  .meta({ id: 'Currency' })
export type Currency = z.infer<typeof Currency>

export const CurrencyList = z.object({ data: z.array(Currency) }).meta({ id: 'CurrencyList' })
export type CurrencyList = z.infer<typeof CurrencyList>
