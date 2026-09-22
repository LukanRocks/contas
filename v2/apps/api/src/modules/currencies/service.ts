import type { Currency } from '@contas/contracts'
import { asc, eq } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { currencies } from '../../db/schema.ts'

export async function listCurrencies(db: Database): Promise<Currency[]> {
  const rows = await db.select().from(currencies).orderBy(asc(currencies.code))

  return rows.map((row) => ({ code: row.code, name: row.name, minor_units: row.minorUnits }))
}

export async function currencyExists(db: Database, code: string): Promise<boolean> {
  const [row] = await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, code))

  return row !== undefined
}
