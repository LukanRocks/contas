import type { AccountBalance, BalanceHistory, SpaceBalances } from '@contas/contracts'
import { and, eq, lt, lte, or, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { accounts, transactions } from '../../db/schema.ts'
import { formatMinorUnits } from '../../lib/money.ts'
import { findAccount } from '../accounts/service.ts'

/*
 * Balances are computed on read from transactions: nothing is cached or snapshotted.
 * `balanceAt` and `balanceBefore` are the only balance arithmetic, and every endpoint is built on them,
 * so the strategy can change later (caching, snapshots) without the API noticing.
 * Sums come back from Postgres as numeric text and stay bigints here: no sum ever passes through a JS number.
 */

/** What flowed in minus what flowed out, over transactions at or before `instant` (or strictly before it). */
async function balance(db: Database, accountId: string, instant: Date, inclusive: boolean): Promise<bigint> {
  const [row] = await db
    .select({
      balance: sql<string>`(
        COALESCE(SUM(${transactions.toValue}) FILTER (WHERE ${transactions.toAccountId} = ${accountId}), 0)
        - COALESCE(SUM(${transactions.fromValue}) FILTER (WHERE ${transactions.fromAccountId} = ${accountId}), 0)
      )::text`,
    })
    .from(transactions)
    .where(
      and(
        or(eq(transactions.fromAccountId, accountId), eq(transactions.toAccountId, accountId)),
        inclusive ? lte(transactions.occurredAt, instant) : lt(transactions.occurredAt, instant),
      ),
    )

  return BigInt(row!.balance)
}

/** The balance including transactions with occurred_at <= instant. */
export const balanceAt = (db: Database, accountId: string, instant: Date) => balance(db, accountId, instant, true)

/** The balance including transactions with occurred_at < instant. */
export const balanceBefore = (db: Database, accountId: string, instant: Date) => balance(db, accountId, instant, false)

export async function getAccountBalance(db: Database, spaceId: string, accountId: string, at: Date): Promise<AccountBalance> {
  const account = await findAccount(db, spaceId, accountId)

  return {
    account_id: account.id,
    currency: account.currencyCode,
    balance: formatMinorUnits(await balanceAt(db, account.id, at)),
    at: at.toISOString(),
  }
}

/** "How much do I have": every managed account, archived ones included, and their totals per currency, never converted. */
export async function getSpaceBalances(db: Database, spaceId: string, at: Date): Promise<SpaceBalances> {
  const managed = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.spaceId, spaceId), eq(accounts.kind, 'managed')))
    .orderBy(sql`lower(${accounts.name})`, accounts.id)
  const balances = await Promise.all(managed.map((account) => balanceAt(db, account.id, at)))
  const totals = new Map<string, bigint>()

  managed.forEach((account, index) => totals.set(account.currencyCode, (totals.get(account.currencyCode) ?? 0n) + balances[index]!))

  return {
    at: at.toISOString(),
    accounts: managed.map((account, index) => ({
      account_id: account.id,
      name: account.name,
      currency: account.currencyCode,
      archived: account.archivedAt !== null,
      balance: formatMinorUnits(balances[index]!),
    })),
    totals: [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, total]) => ({ currency, balance: formatMinorUnits(total) })),
  }
}

type PeriodRow = { inflow: string; outflow: string; balance: string }

/**
 * The account's balance over the periods between consecutive `edges`, each [start, end).
 * Every period is returned, empty and future ones included, and the last balance always equals balanceBefore(the last edge).
 * `edges` must already be strictly increasing UTC timestamps (the contract checks it).
 */
export async function getBalanceHistory(db: Database, spaceId: string, accountId: string, edges: string[]): Promise<BalanceHistory> {
  const account = await findAccount(db, spaceId, accountId)
  const instants = edges.map((edge) => new Date(edge))
  const startingBalance = await balanceBefore(db, account.id, instants[0]!)
  // One array parameter: drizzle would spread a JS array into a list of parameters, so it goes over as a Postgres array literal.
  // The contract only lets through timestamps like 2026-06-01T03:00:00Z, which need no quoting inside one.
  const edgeArray = `{${instants.map((instant) => instant.toISOString()).join(',')}}`

  // The spec's reference query (§10.9), with the running total seeded from balanceBefore(edges[0]).
  const rows = await db.execute<PeriodRow>(sql`
    WITH periods AS (
      SELECT edge AS period_start, lead(edge) OVER (ORDER BY edge) AS period_end
      FROM unnest(${edgeArray}::timestamptz[]) AS edge
    ),
    buckets AS (
      SELECT period_start, period_end FROM periods WHERE period_end IS NOT NULL
    ),
    movements AS (
      SELECT
        bucket.period_start,
        SUM(${transactions.toValue}) FILTER (WHERE ${transactions.toAccountId} = ${account.id}) AS inflow,
        SUM(${transactions.fromValue}) FILTER (WHERE ${transactions.fromAccountId} = ${account.id}) AS outflow
      FROM buckets AS bucket
      JOIN ${transactions}
        ON ${transactions.occurredAt} >= bucket.period_start
       AND ${transactions.occurredAt} < bucket.period_end
       AND (${transactions.fromAccountId} = ${account.id} OR ${transactions.toAccountId} = ${account.id})
      GROUP BY bucket.period_start
    )
    SELECT
      COALESCE(movement.inflow, 0)::text AS inflow,
      COALESCE(movement.outflow, 0)::text AS outflow,
      (${startingBalance.toString()}::numeric
        + SUM(COALESCE(movement.inflow, 0) - COALESCE(movement.outflow, 0)) OVER (ORDER BY bucket.period_start))::text AS balance
    FROM buckets AS bucket
    LEFT JOIN movements AS movement USING (period_start)
    ORDER BY bucket.period_start
  `)

  // One row per period, in edge order, so each row's bounds are the edges around it.
  return {
    account_id: account.id,
    currency: account.currencyCode,
    starting_balance: formatMinorUnits(startingBalance),
    points: [...rows].map((row, index) => ({
      period_start: instants[index]!.toISOString(),
      period_end: instants[index + 1]!.toISOString(),
      inflow: formatMinorUnits(row.inflow),
      outflow: formatMinorUnits(row.outflow),
      balance: formatMinorUnits(row.balance),
    })),
  }
}
