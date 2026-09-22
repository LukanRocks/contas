import { z } from 'zod'

/** `status` reflects whether Postgres answered `SELECT 1`. */
export const Health = z
  .object({
    status: z.enum(['ok', 'error']),
    version: z.string(),
  })
  .meta({ id: 'Health' })
export type Health = z.infer<typeof Health>
