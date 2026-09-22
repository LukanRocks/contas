import { OpenAPIHono } from '@hono/zod-openapi'
import type { Database } from '../db/client.ts'
import { fromZodError, problemResponse } from './errors.ts'

export type AppEnv = {
  Variables: {
    db: Database
  }
}

/**
 * Every module builds its routes on one of these.
 * The hook is per instance, it does not reach sub-apps mounted with `route()`
 * so each router must be created here to answer schema failures with the same 422 problem+json.
 */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) return problemResponse(fromZodError(result.error))
    },
  })
}
