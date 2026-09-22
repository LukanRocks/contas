import type { Problem, ProblemCode, ProblemFieldError } from '@contas/contracts'
import type { z } from 'zod'

const STATUS: Record<ProblemCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_error: 422,
  internal_error: 500,
}

const TITLE: Record<ProblemCode, string> = {
  bad_request: 'Bad request',
  unauthenticated: 'Unauthenticated',
  forbidden: 'Forbidden',
  not_found: 'Not found',
  conflict: 'Conflict',
  validation_error: 'Validation failed',
  internal_error: 'Internal error',
}

/** Thrown anywhere below a route; `app.onError` turns it into problem+json. */
export class AppError extends Error {
  override name = 'AppError'
  readonly code: ProblemCode
  readonly detail: string | undefined
  readonly errors: ProblemFieldError[] | undefined

  constructor(code: ProblemCode, detail?: string, errors?: ProblemFieldError[]) {
    super(detail ?? TITLE[code])
    this.code = code
    this.detail = detail
    this.errors = errors
  }

  get status(): number {
    return STATUS[this.code]
  }
}

export const badRequest = (detail?: string) => new AppError('bad_request', detail)
export const unauthenticated = (detail?: string) => new AppError('unauthenticated', detail)
export const forbidden = (detail?: string) => new AppError('forbidden', detail)
export const notFound = (detail?: string) => new AppError('not_found', detail)
export const conflict = (detail?: string) => new AppError('conflict', detail)
export const validationError = (detail?: string, errors?: ProblemFieldError[]) => new AppError('validation_error', detail, errors)

/** Schema failures from request parsing, one entry per offending field. */
export function fromZodError(error: z.ZodError): AppError {
  const errors = error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }))
  return validationError('The request does not match the schema.', errors)
}

export function problemBody(code: ProblemCode, detail?: string, errors?: ProblemFieldError[]): Problem {
  return {
    type: 'about:blank',
    title: TITLE[code],
    status: STATUS[code],
    code,
    ...(detail === undefined ? {} : { detail }),
    ...(errors === undefined ? {} : { errors }),
  }
}

export function problemResponse(err: AppError): Response {
  return new Response(JSON.stringify(problemBody(err.code, err.detail, err.errors)), {
    status: err.status,
    headers: { 'content-type': 'application/problem+json' },
  })
}
