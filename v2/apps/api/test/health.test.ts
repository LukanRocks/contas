import { describe, expect, spyOn, test } from 'bun:test'
import pkg from '../package.json' with { type: 'json' }
import { createApp } from '../src/app.ts'
import { createDb } from '../src/db/client.ts'
import { env } from '../src/env.ts'
import { call, withRollback } from './helpers.ts'

describe('GET /health', () => {
  test('is ok, with the version, when Postgres answers', () =>
    withRollback(async ({ app }) => {
      const res = await call(app, 'GET', '/health')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: 'ok', version: env.version })
    }))

  test('needs no X-User-Id', () =>
    withRollback(async ({ app }) => {
      expect((await call(app, 'GET', '/health')).status).toBe(200)
    }))

  test('falls back to the package version without APP_VERSION', () => {
    if (env.APP_VERSION) return
    expect(env.version).toBe(pkg.version)
  })

  test('is 503 with status error when Postgres does not answer', async () => {
    // Nothing listens on port 1, so the connection is refused at once.
    const { db, sql } = createDb('postgres://nobody@127.0.0.1:1/nothing')
    const log = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = await call(createApp({ db }), 'GET', '/health')
      expect(res.status).toBe(503)
      expect(res.body).toEqual({ status: 'error', version: env.version })
      expect(log).toHaveBeenCalledTimes(1)
    } finally {
      log.mockRestore()
      await sql.end()
    }
  })
})

describe('API documentation', () => {
  test('serves an OpenAPI 3.1 document that lists /health', () =>
    withRollback(async ({ app }) => {
      const res = await call(app, 'GET', '/v1/openapi.json')
      expect(res.status).toBe(200)
      expect(res.body.openapi).toBe('3.1.0')
      expect(res.body.info.version).toBe(env.version)
      expect(Object.keys(res.body.paths)).toContain('/health')
      expect(res.body.components.schemas).toHaveProperty('Health')
    }))

  test('serves the Scalar reference at /docs, pointed at the document', () =>
    withRollback(async ({ app }) => {
      const res = await call(app, 'GET', '/docs')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      expect(res.text).toContain('/v1/openapi.json')
    }))
})
