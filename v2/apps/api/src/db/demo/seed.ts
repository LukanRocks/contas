import { AddMember, CreateAccount, CreateSpace, CreateTransaction, CreateUser, UpdateAccount, UpdateTransaction, type User } from '@contas/contracts'
import { eq, like, sql } from 'drizzle-orm'
import { requireEnv } from '../../env.ts'
import type { Actor } from '../../lib/router.ts'
import { createAccount, updateAccount } from '../../modules/accounts/service.ts'
import { getSpaceBalances } from '../../modules/balances/service.ts'
import { listCurrencies } from '../../modules/currencies/service.ts'
import { addMember } from '../../modules/members/service.ts'
import { createSpace, deleteSpace } from '../../modules/spaces/service.ts'
import { createTransaction, deleteTransaction, updateTransaction } from '../../modules/transactions/service.ts'
import { createUser, deleteUser } from '../../modules/users/service.ts'
import { createDb, type Database } from '../client.ts'
import { accounts, spaces, transactions, users } from '../schema.ts'
import { DEMO_SUFFIX, SPACES, USERS, type DemoSpace, type DemoUser } from './ledger.ts'

/*
 * Fills the database with the demo dataset of §13, through the service layer rather than raw inserts,
 * so every business rule, system account and audit row happens exactly as it would through the API.
 * Every input is also parsed by its contract first, as a request body would be.
 *
 *   bun run apps/api/src/db/demo/seed.ts [--reset]
 */

export class DemoExistsError extends Error {
  override name = 'DemoExistsError'
}

export type DemoSummary = {
  users: Record<DemoUser, User>
  spaces: Array<{
    id: string
    name: string
    accounts: { managed: number; unmanaged: number; system: number }
    transactions: number
    totals: Array<{ currency: string; balance: string }>
  }>
}

const actorOf = (user: User): Actor => ({ id: user.id, name: user.name })

/** Everything demo data lives in: spaces and users whose names end in "(demo)". */
async function findDemo(db: Database) {
  const pattern = `%${DEMO_SUFFIX}`

  return {
    spaces: await db.select({ id: spaces.id, name: spaces.name }).from(spaces).where(like(spaces.name, pattern)),
    users: await db.select().from(users).where(like(users.name, pattern)),
  }
}

/** Deletes demo spaces (which cascades through everything in them), then demo users, each deleting themselves. */
async function removeDemo(tx: Database, demo: Awaited<ReturnType<typeof findDemo>>) {
  for (const space of demo.spaces) await deleteSpace(tx, { id: space.id, role: 'owner' })
  for (const user of demo.users) await deleteUser(tx, user.id, { id: user.id, name: user.name })
}

function raise(message: string): never {
  throw new Error(message)
}

async function seedSpace(tx: Database, demo: DemoSpace, people: Record<DemoUser, User>) {
  const ana = actorOf(people.ana)
  const space = await createSpace(tx, CreateSpace.parse({ name: demo.name }), ana)

  for (const member of demo.members) await addMember(tx, space.id, AddMember.parse({ user_id: people[member.user].id, role: member.role }), ana)

  const accountIds = new Map<string, string>()

  for (const account of demo.accounts) {
    const input = CreateAccount.parse({
      name: account.name,
      kind: account.kind,
      currency_code: account.currency,
      ...(account.openingBalance ? { opening_balance: { value: account.openingBalance, occurred_at: demo.openedAt } } : {}),
    })

    accountIds.set(account.key, (await createAccount(tx, space.id, input, ana)).id)
  }

  const accountId = (key: string) => accountIds.get(key) ?? raise(`${demo.name}: no account "${key}" in the ledger.`)
  // Stable, so transactions at the same instant keep the order the ledger lists them in.
  const chronological = [...demo.transactions].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))

  for (const transaction of chronological) {
    const actor = actorOf(people[transaction.actor])
    const input = CreateTransaction.parse({
      name: transaction.name,
      from_account_id: accountId(transaction.from),
      to_account_id: accountId(transaction.to),
      from_value: transaction.fromValue,
      ...(transaction.toValue ? { to_value: transaction.toValue } : {}),
      occurred_at: transaction.occurredAt,
    })
    const created = await createTransaction(tx, space.id, input, actor)
    const then = transaction.then

    if (then === 'delete') await deleteTransaction(tx, space.id, created.id, actor)
    else if (then && 'archive' in then) await updateAccount(tx, space.id, accountId(then.archive), UpdateAccount.parse({ archived: true }), actor)
    else if (then) {
      const correction = UpdateTransaction.parse({ from_value: then.update.fromValue, to_value: then.update.toValue })

      await updateTransaction(tx, space.id, created.id, correction, actor)
    }
  }

  return space
}

async function summarise(tx: Database, space: { id: string; name: string }): Promise<DemoSummary['spaces'][number]> {
  const kinds = await tx
    .select({ kind: accounts.kind, count: sql<number>`count(*)::int` })
    .from(accounts)
    .where(eq(accounts.spaceId, space.id))
    .groupBy(accounts.kind)
  const [counted] = await tx.select({ count: sql<number>`count(*)::int` }).from(transactions).where(eq(transactions.spaceId, space.id))
  const countOf = (kind: string) => kinds.find((row) => row.kind === kind)?.count ?? 0

  return {
    id: space.id,
    name: space.name,
    accounts: { managed: countOf('managed'), unmanaged: countOf('unmanaged'), system: countOf('system') },
    transactions: counted?.count ?? 0,
    totals: (await getSpaceBalances(tx, space.id, new Date())).totals,
  }
}

/**
 * Creates the demo dataset in one database transaction, so a failure leaves nothing half-made.
 * Refuses when demo data already exists, unless `reset` is set: then that data is deleted first and everything recreated.
 */
export async function runDemoSeed(db: Database, { reset }: { reset: boolean }): Promise<DemoSummary> {
  return db.transaction(async (tx) => {
    const existing = await findDemo(tx)

    if (existing.spaces.length + existing.users.length > 0) {
      if (!reset) {
        const names = [...existing.spaces, ...existing.users].map((row) => `"${row.name}"`).join(', ')

        throw new DemoExistsError(`Demo data already exists (${names}). Run with --reset to delete and recreate it.`)
      }

      await removeDemo(tx, existing)
    }

    const people = {} as Record<DemoUser, User>

    // Nobody is acting yet: like POST /v1/users without X-User-Id.
    for (const [key, name] of Object.entries(USERS) as Array<[DemoUser, string]>) people[key] = await createUser(tx, CreateUser.parse({ name }), null)

    const created = []

    for (const demo of SPACES) created.push(await seedSpace(tx, demo, people))

    return { users: people, spaces: await Promise.all(created.map((space) => summarise(tx, space))) }
  })
}

/** "3077710" with 2 minor units is "30777.10". For the summary only: the API itself never formats money. */
function inMajorUnits(minor: string, minorUnits: number): string {
  const negative = minor.startsWith('-')
  const digits = (negative ? minor.slice(1) : minor).padStart(minorUnits + 1, '0')
  const whole = minorUnits === 0 ? digits : `${digits.slice(0, -minorUnits)}.${digits.slice(-minorUnits)}`

  return `${negative ? '-' : ''}${whole}`
}

if (import.meta.main) {
  const reset = process.argv.includes('--reset')
  const { db, sql: client } = createDb(requireEnv('DATABASE_URL'))

  try {
    const summary = await runDemoSeed(db, { reset })
    const minorUnits = new Map((await listCurrencies(db)).map((currency) => [currency.code, currency.minor_units]))

    console.log(`Demo data ${reset ? 'recreated' : 'created'}.`)
    console.log(`  users: ${Object.values(summary.users).map((user) => user.name).join(', ')}`)

    for (const space of summary.spaces) {
      const { managed, unmanaged, system } = space.accounts
      const totals = space.totals.map((total) => `${inMajorUnits(total.balance, minorUnits.get(total.currency) ?? 2)} ${total.currency}`)

      const kinds = `${managed} managed, ${unmanaged} unmanaged, ${system} system`

      console.log(`  ${space.name}: ${managed + unmanaged + system} accounts (${kinds}), ${space.transactions} transactions`)
      console.log(`    managed totals: ${totals.join(', ')}`)
    }
  } catch (err) {
    if (!(err instanceof DemoExistsError)) throw err

    console.error(err.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}
