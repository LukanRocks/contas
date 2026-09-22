import { Problem, type Role } from '@contas/contracts'
import { OpenAPIHono } from '@hono/zod-openapi'
import type { z } from 'zod'
import type { Database } from '../db/client.ts'
import { fromZodError, notFound, problemResponse } from './errors.ts'

/** The user named by X-User-Id. */
export type Actor = { id: string; name: string }

/** The space in the path, and the acting user's role in it. */
export type SpaceAccess = { id: string; role: Role }

export type AppEnv = {
  Variables: {
    db: Database
    /** Set by the acting-user middleware on every /v1 route that requires it. */
    actor: Actor
    /** Set by the space-access middleware on every /v1/spaces/{sid} route. */
    space: SpaceAccess
  }
}

/**
 * Every module builds its routes on one of these.
 * The hook is per instance, it does not reach sub-apps mounted with `route()`,
 * so each router must be created here to answer schema failures the same way.
 */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (result.success) return
      // A path id that is not even a UUID cannot name anything that exists.
      if (result.target === 'param') return problemResponse(notFound())

      return problemResponse(fromZodError(result.error))
    },
  })
}

/** A JSON response for a route definition. */
export const json = <Schema extends z.ZodType>(schema: Schema, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

/** A required JSON request body. Without `required`, a request sent without a JSON content type would skip validation. */
export const jsonBody = <Schema extends z.ZodType>(schema: Schema) => ({
  required: true,
  content: { 'application/json': { schema } },
})

const PROBLEMS = {
  400: 'The body is not valid JSON',
  401: 'X-User-Id is missing, malformed or unknown',
  403: "The acting user's role does not allow this",
  404: 'Not found, or not visible to the acting user',
  409: 'Conflicts with the current state',
  422: 'The request fails validation',
} as const

type ProblemStatus = keyof typeof PROBLEMS
type ProblemResponse = { description: string; content: { 'application/problem+json': { schema: typeof Problem } } }

/** The problem+json responses a route can answer with, for the OpenAPI document. */
export function problems<const Statuses extends ProblemStatus[]>(...statuses: Statuses): { [Status in Statuses[number]]: ProblemResponse } {
  const responses: Partial<Record<ProblemStatus, ProblemResponse>> = {}

  for (const status of statuses) responses[status] = { description: PROBLEMS[status], content: { 'application/problem+json': { schema: Problem } } }

  return responses as { [Status in Statuses[number]]: ProblemResponse }
}
