import { and, eq } from 'drizzle-orm'
import type { Database } from '../src/db/client.ts'
import { accounts } from '../src/db/schema.ts'
import { createAccount, createCast } from './helpers.ts'

/**
 * A cast plus one account of every kind the transaction rules care about:
 * managed and unmanaged in BRL and USD, the two Opening Balance accounts, and an archived managed account.
 */
export async function createLedger(db: Database) {
  const cast = await createCast(db)
  const { owner, space } = cast
  const nubank = await createAccount(db, space, owner, { name: 'Nubank' })
  const savings = await createAccount(db, space, owner, { name: 'Poupança' })
  const wise = await createAccount(db, space, owner, { name: 'Wise USD', currency_code: 'USD' })
  const market = await createAccount(db, space, owner, { name: 'Supermercado', kind: 'unmanaged' })
  const ifood = await createAccount(db, space, owner, { name: 'iFood', kind: 'unmanaged' })
  const amazonUs = await createAccount(db, space, owner, { name: 'Amazon US', kind: 'unmanaged', currency_code: 'USD' })
  const oldBank = await createAccount(db, space, owner, { name: 'Banco Antigo' })

  await db.update(accounts).set({ archivedAt: new Date() }).where(eq(accounts.id, oldBank.id))

  const system = async (currency: string) => {
    const [row] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.spaceId, space.id), eq(accounts.systemKey, 'opening_balance'), eq(accounts.currencyCode, currency)))

    return row!
  }

  return { ...cast, nubank, savings, wise, market, ifood, amazonUs, oldBank, openingBrl: await system('BRL'), openingUsd: await system('USD') }
}
