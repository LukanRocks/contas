import { Uuid } from '@contas/contracts'

/**
 * Every primary key comes from here: UUIDv7, generated in the application rather than by Postgres.
 * Bun's UUIDv7s are monotonic, so ids sort in creation order even within one millisecond.
 * The audit log relies on that: rows written in one transaction share the same `at`, and their id is what orders them.
 * Generating ids anywhere else, with another UUID version, would silently break that order.
 */
export const newId = () => Bun.randomUUIDv7()

/**
 * Checks an id from a header or path before it reaches a query.
 * Postgres answers a malformed uuid with an error, which would surface as a 500 instead of a clean 401 or 404.
 * Uses the contracts' schema, so the API has one definition of a valid id.
 */
export const isUuid = (value: string) => Uuid.safeParse(value).success
