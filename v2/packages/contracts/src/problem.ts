import { z } from 'zod'

/** Every `code` an error response can carry, one per HTTP status the API uses. */
export const ProblemCode = z.enum(['bad_request', 'unauthenticated', 'forbidden', 'not_found', 'conflict', 'validation_error', 'internal_error'])
export type ProblemCode = z.infer<typeof ProblemCode>

/** One offending field in a validation failure. `path` is dotted, e.g. `opening_balance.value`. */
export const ProblemFieldError = z.object({
  path: z.string(),
  message: z.string(),
})

export type ProblemFieldError = z.infer<typeof ProblemFieldError>

/** RFC 9457 problem details, served as `application/problem+json`. */
export const Problem = z
  .object({
    type: z.literal('about:blank'),
    title: z.string(),
    status: z.number().int(),
    code: ProblemCode,
    detail: z.string().optional(),
    errors: z.array(ProblemFieldError).optional(),
  })
  .meta({ id: 'Problem' })

export type Problem = z.infer<typeof Problem>
