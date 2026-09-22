import { INT64_MAX, MinorUnits, SignedMinorUnits, UtcTimestamp } from '@contas/contracts'
import { describe, expect, test } from 'bun:test'
import { formatMinorUnits, parseMinorUnits } from '../src/lib/money.ts'

const ABOVE_2_53 = '9007199254740993'

describe('MinorUnits (transaction values)', () => {
  for (const value of ['1', '12345', ABOVE_2_53, INT64_MAX.toString()]) {
    test(`accepts "${value}"`, () => expect(MinorUnits.safeParse(value).success).toBe(true))
  }

  for (const value of ['0', '-1', '012', '12.50', '1e3', ' 1', '', (INT64_MAX + 1n).toString()]) {
    test(`rejects "${value}"`, () => expect(MinorUnits.safeParse(value).success).toBe(false))
  }

  test('rejects a JSON number, even a whole one', () => expect(MinorUnits.safeParse(12345).success).toBe(false))

  test('reports a malformed value once, without trying to read it as a number', () => {
    const issues = MinorUnits.safeParse('12.50').error?.issues ?? []

    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('whole number')
  })
})

describe('SignedMinorUnits (opening balances)', () => {
  for (const value of ['0', '-0', '320000', '-150000', ABOVE_2_53, `-${ABOVE_2_53}`, INT64_MAX.toString(), `-${INT64_MAX}`]) {
    test(`accepts "${value}"`, () => expect(SignedMinorUnits.safeParse(value).success).toBe(true))
  }

  // -2^63 fits a bigint, but a negative opening balance is stored as its absolute value, and 2^63 does not.
  for (const value of ['1.5', '--1', '+1', '', (INT64_MAX + 1n).toString(), `-${INT64_MAX + 1n}`]) {
    test(`rejects "${value}"`, () => expect(SignedMinorUnits.safeParse(value).success).toBe(false))
  }
})

describe('UtcTimestamp (every timestamp a client sends)', () => {
  for (const value of ['2026-09-20T17:30:00Z', '2026-09-20T17:30:00.1Z', '2026-09-20T17:30:00.123Z', '2028-02-29T00:00:00Z']) {
    test(`accepts ${value}`, () => expect(UtcTimestamp.safeParse(value).success).toBe(true))
  }

  for (const value of [
    '2026-09-20T17:30:00-03:00',
    '2026-09-20T17:30:00+00:00',
    '2026-09-20T17:30:00',
    '2026-09-20T17:30Z',
    '2026-09-20',
    '2026-09-20T17:30:00.1234Z',
    '2026-09-20 17:30:00Z',
    '2026-02-30T00:00:00Z',
    '2027-02-29T00:00:00Z',
    '2026-09-20T24:00:00Z',
    '2026-09-20T23:59:60Z',
    '2026-13-01T00:00:00Z',
  ]) {
    test(`rejects ${value}`, () => expect(UtcTimestamp.safeParse(value).success).toBe(false))
  }
})

describe('lib/money', () => {
  test('round-trips values above 2^53 without losing precision', () => {
    expect(Number(ABOVE_2_53).toString()).not.toBe(ABOVE_2_53)
    expect(formatMinorUnits(parseMinorUnits(ABOVE_2_53))).toBe(ABOVE_2_53)
    expect(formatMinorUnits(INT64_MAX)).toBe('9223372036854775807')
  })

  test('formats the numeric strings Postgres returns for SUM', () => {
    expect(formatMinorUnits('-1250000')).toBe('-1250000')
    expect(formatMinorUnits('0')).toBe('0')
  })
})
