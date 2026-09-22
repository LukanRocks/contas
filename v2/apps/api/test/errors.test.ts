import { createRoute, z } from '@hono/zod-openapi'
import { describe, expect, spyOn, test } from 'bun:test'
import type { App } from '../src/app.ts'
import { conflict } from '../src/lib/errors.ts'
import { call, withRollback } from './helpers.ts'

/** Routes that exist only to drive each branch of the error handling. */
function withProbeRoutes(app: App): App {
  app.get('/__probe/crash', () => {
    throw new Error('boom')
  })
  app.get('/__probe/conflict', () => {
    throw conflict('Already taken.')
  })
  app.openapi(
    createRoute({
      method: 'post',
      path: '/__probe/echo',
      request: {
        body: { content: { 'application/json': { schema: z.object({ name: z.string().min(1) }) } } },
      },
      responses: { 200: { description: 'Echo' } },
    }),
    (context) => context.json(context.req.valid('json'), 200),
  )
  return app
}

const PROBLEM = 'application/problem+json'

describe('problem+json errors', () => {
  test('an unknown route is 404 not_found', () =>
    withRollback(async ({ app }) => {
      const res = await call(app, 'GET', '/nope')
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toBe(PROBLEM)
      expect(res.body).toMatchObject({ type: 'about:blank', title: 'Not found', status: 404, code: 'not_found' })
    }))

  test('an AppError keeps its status, code and detail', () =>
    withRollback(async ({ app }) => {
      const res = await call(withProbeRoutes(app), 'GET', '/__probe/conflict')
      expect(res.status).toBe(409)
      expect(res.headers.get('content-type')).toBe(PROBLEM)
      expect(res.body).toEqual({
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        code: 'conflict',
        detail: 'Already taken.',
      })
    }))

  test('an unexpected error is 500 internal_error, logged but not leaked', () =>
    withRollback(async ({ app }) => {
      const log = spyOn(console, 'error').mockImplementation(() => {})
      try {
        const res = await call(withProbeRoutes(app), 'GET', '/__probe/crash')
        expect(res.status).toBe(500)
        expect(res.body).toEqual({ type: 'about:blank', title: 'Internal error', status: 500, code: 'internal_error' })
        expect(log).toHaveBeenCalledTimes(1)
      } finally {
        log.mockRestore()
      }
    }))

  test('malformed JSON is 400 bad_request', () =>
    withRollback(async ({ app }) => {
      const res = await call(withProbeRoutes(app), 'POST', '/__probe/echo', { body: '{not json' })
      expect(res.status).toBe(400)
      expect(res.headers.get('content-type')).toBe(PROBLEM)
      expect(res.body.code).toBe('bad_request')
    }))

  test('a schema violation is 422 validation_error with per-field errors', () =>
    withRollback(async ({ app }) => {
      const res = await call(withProbeRoutes(app), 'POST', '/__probe/echo', { body: { name: '' } })
      expect(res.status).toBe(422)
      expect(res.headers.get('content-type')).toBe(PROBLEM)
      expect(res.body).toMatchObject({ title: 'Validation failed', status: 422, code: 'validation_error' })
      expect(res.body.errors).toEqual([{ path: 'name', message: expect.any(String) }])
    }))

  test('a valid body passes through', () =>
    withRollback(async ({ app }) => {
      const res = await call(withProbeRoutes(app), 'POST', '/__probe/echo', { body: { name: 'Ana' } })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ name: 'Ana' })
    }))
})
