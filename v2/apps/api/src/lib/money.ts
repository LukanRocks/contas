/**
 * Money is a bigint of minor units everywhere below the API, and an integer string at the API.
 * It never passes through a JS number, which silently loses precision above 2^53.
 */

/** From an API string already checked by the contracts' MinorUnits or SignedMinorUnits. */
export const parseMinorUnits = (value: string): bigint => BigInt(value)

/** To an API string. Takes a bigint column, or the numeric string Postgres returns for SUM(bigint). */
export const formatMinorUnits = (value: bigint | string): string => BigInt(value).toString()
