import { z } from 'zod'
import { CurrencyCode } from './currencies.ts'
import { Amount, emptyAsAbsent, Timestamp, UtcTimestamp, Uuid } from './primitives.ts'

export const BalanceQuery = z.object({
  at: emptyAsAbsent(UtcTimestamp).meta({ description: 'Include transactions up to and including this instant. Defaults to now.' }),
})
export type BalanceQuery = z.infer<typeof BalanceQuery>

export const AccountBalance = z
  .object({
    account_id: Uuid,
    currency: CurrencyCode,
    balance: Amount,
    at: Timestamp,
  })
  .meta({ id: 'AccountBalance' })
export type AccountBalance = z.infer<typeof AccountBalance>

export const SpaceBalances = z
  .object({
    at: Timestamp,
    accounts: z
      .array(z.object({ account_id: Uuid, name: z.string(), currency: CurrencyCode, archived: z.boolean(), balance: Amount }))
      .meta({ description: 'Every managed account, archived ones included, by name.' }),
    totals: z
      .array(z.object({ currency: CurrencyCode, balance: Amount }))
      .meta({ description: 'Managed balances summed per currency, by code. Never converted between currencies.' }),
  })
  .meta({ id: 'SpaceBalances' })
export type SpaceBalances = z.infer<typeof SpaceBalances>

export const MAX_EDGES = 367

export const BalanceHistoryRequest = z
  .strictObject({
    edges: z
      .array(UtcTimestamp)
      .min(2, 'Send at least 2 edges: they bound at least one period.')
      .max(MAX_EDGES, `Send at most ${MAX_EDGES} edges, i.e. 366 periods.`)
      .superRefine((edges, context) => {
        for (let index = 1; index < edges.length; index++) {
          if (Date.parse(edges[index]!) <= Date.parse(edges[index - 1]!)) {
            context.addIssue({ code: 'custom', path: [index], message: `Must be later than edges[${index - 1}]: edges are strictly increasing.` })

            return
          }
        }
      })
      .meta({
        description: [
          'Period boundaries in UTC, strictly increasing. Each consecutive pair is one period, start inclusive and end exclusive.',
          'The client picks them, e.g. local month starts converted to UTC: the server has no notion of timezones or calendars.',
        ].join(' '),
        example: ['2026-06-01T03:00:00Z', '2026-07-01T03:00:00Z', '2026-08-01T03:00:00Z', '2026-09-01T03:00:00Z'],
      }),
  })
  .meta({ id: 'BalanceHistoryRequest' })
export type BalanceHistoryRequest = z.infer<typeof BalanceHistoryRequest>

export const BalanceHistory = z
  .object({
    account_id: Uuid,
    currency: CurrencyCode,
    starting_balance: Amount.meta({ description: 'The balance just before edges[0].' }),
    points: z.array(
      z.object({
        period_start: Timestamp,
        period_end: Timestamp,
        inflow: Amount.meta({ description: 'Sum of to_value of transactions into the account during the period.' }),
        outflow: Amount.meta({ description: 'Sum of from_value of transactions out of the account during the period.' }),
        balance: Amount.meta({ description: 'The closing balance: everything before period_end.' }),
      }),
    ),
  })
  .meta({ id: 'BalanceHistory' })
export type BalanceHistory = z.infer<typeof BalanceHistory>
