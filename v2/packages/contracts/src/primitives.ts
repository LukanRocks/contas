import { z } from 'zod'

export const Uuid = z.uuid()

/** How every timestamp is returned: UTC, millisecond precision. */
export const Timestamp = z.iso.datetime({ precision: 3 }).meta({ example: '2026-09-20T17:30:00.000Z' })

const UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?Z$/

/** True when every field survives a round trip through Date, which rolls impossible dates like 30 February over into March. */
function isRealInstant(value: string): boolean {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return false

  const [, year, month, day, hour, minute, second] = UTC_TIMESTAMP.exec(value) ?? []

  return date.toISOString().startsWith(`${year}-${month}-${day}T${hour}:${minute}:${second}`)
}

/**
 * How every timestamp is sent: UTC only, ending in Z, with up to millisecond precision.
 * Local offsets like -03:00, and timestamps without one, are refused. Converting local time to UTC is the client's job.
 */
export const UtcTimestamp = z
  .string()
  .regex(UTC_TIMESTAMP, { message: 'Must be a UTC timestamp ending in Z, e.g. 2026-09-20T17:30:00Z.', abort: true })
  .refine(isRealInstant, 'Must be a real date and time.')
  .meta({ example: '2026-09-20T17:30:00Z' })

/** For query parameters: an absent one and an empty one (`?q=`) mean the same thing. */
export const emptyAsAbsent = <Schema extends z.ZodType>(schema: Schema) => z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

/** The query parameters every paginated list takes. Pages follow `next_cursor` until it is null. */
export const PageQuery = {
  cursor: emptyAsAbsent(z.string()).meta({ description: 'The next_cursor of the previous page.' }),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}

/** The largest value Postgres' bigint holds: 2^63 - 1. */
export const INT64_MAX = 9223372036854775807n

/** A transaction value: a positive whole number of the currency's minor units, as a string, so no JSON number ever rounds it. */
export const MinorUnits = z
  .string()
  .regex(/^[1-9][0-9]*$/, { message: 'Must be a positive whole number of minor units, as a string, e.g. "12345".', abort: true })
  .refine((value) => BigInt(value) <= INT64_MAX, `Must be at most ${INT64_MAX}.`)
  .meta({ example: '12345', description: 'Integer minor units of the currency, as a string: "12345" is 123.45 BRL.' })

/**
 * A signed whole number of minor units, as a string.
 * Bounded to ±(2^63 - 1) rather than bigint's full range, because a negative opening balance is stored as its absolute value.
 */
export const SignedMinorUnits = z
  .string()
  .regex(/^-?[0-9]+$/, { message: 'Must be a whole number of minor units, as a string, e.g. "-12345".', abort: true })
  .refine((value) => {
    const amount = BigInt(value)

    return amount <= INT64_MAX && amount >= -INT64_MAX
  }, `Must be between -${INT64_MAX} and ${INT64_MAX}.`)
  .meta({ example: '320000', description: 'Signed integer minor units of the currency, as a string.' })

/**
 * A computed amount, e.g. a balance or a period's inflow: signed integer minor units, as a string.
 * Unlike stored values it has no 64-bit bound, because a sum of many bigints can exceed one.
 */
export const Amount = z.string().meta({ description: 'Signed integer minor units, as a string.', example: '-73550' })

/** Postgres text cannot hold NUL, so strings that would reach it are checked for one rather than failing in the database. */
export const hasNoNul = (value: string) => !value.includes('\u0000')

/**
 * A name of 1 to `max` characters, after leading and trailing whitespace is trimmed, the trimmed value is what gets stored.
 * So a name of only whitespace is refused.
 * Characters are counted as code points, the way Postgres' char_length and JSON Schema's maxLength count them.
 */
export const boundedName = (max: number) =>
  z
    .string()
    .trim()
    .refine((name) => {
      const length = [...name].length

      return length >= 1 && length <= max
    }, `Must be 1 to ${max} characters.`)
    .refine(hasNoNul, 'Must not contain NUL characters.')
    .meta({ minLength: 1, maxLength: max, description: 'Leading and trailing whitespace is trimmed before the length is checked and the name is stored.' })
