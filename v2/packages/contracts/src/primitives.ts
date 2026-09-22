import { z } from 'zod'

export const Uuid = z.uuid()

/** How every timestamp is returned: UTC, millisecond precision. */
export const Timestamp = z.iso.datetime({ precision: 3 }).meta({ example: '2026-09-20T17:30:00.000Z' })

/**
 * A name of 1 to `max` characters, after leading and trailing whitespace is trimmed, the trimmed value is what gets stored.
 * So a name of only whitespace is refused.
 * Characters are counted as code points, the way Postgres' char_length and JSON Schema's maxLength count them.
 * Postgres text cannot hold NUL, so it is refused here rather than failing in the database.
 */
export const boundedName = (max: number) =>
  z
    .string()
    .trim()
    .refine((name) => {
      const length = [...name].length

      return length >= 1 && length <= max
    }, `Must be 1 to ${max} characters.`)
    .refine((name) => !name.includes('\u0000'), 'Must not contain NUL characters.')
    .meta({ minLength: 1, maxLength: max, description: 'Leading and trailing whitespace is trimmed before the length is checked and the name is stored.' })
