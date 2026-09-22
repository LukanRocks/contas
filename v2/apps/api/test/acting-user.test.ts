import { describe, expect, test } from 'bun:test'
import { call, createUser, withRollback } from './helpers.ts'

const UNKNOWN_USER = '01900000-0000-7000-8000-000000000000'

describe('X-User-Id', () => {
  for (const [label, headers] of [
    ['missing', {}],
    ['malformed', { 'x-user-id': 'ana' }],
    ['unknown', { 'x-user-id': UNKNOWN_USER }],
  ] as const) {
    test(`${label} is 401 unauthenticated`, () =>
      withRollback(async ({ app }) => {
        for (const path of ['/v1/users', '/v1/spaces', `/v1/spaces/${UNKNOWN_USER}`, '/v1/nope']) {
          const res = await call(app, 'GET', path, { headers })

          expect(res.status).toBe(401)
          expect(res.headers.get('content-type')).toBe('application/problem+json')
          expect(res.body.code).toBe('unauthenticated')
        }
      }))
  }

  test('a known user gets through', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')

      expect((await call(app, 'GET', '/v1/users', { user: ana.id })).status).toBe(200)
      expect((await call(app, 'GET', '/v1/spaces', { user: ana.id })).status).toBe(200)
    }))

  test('an unknown /v1 route is 404 once the user is known', () =>
    withRollback(async ({ app, db }) => {
      const ana = await createUser(db, 'Ana')

      expect((await call(app, 'GET', '/v1/nope', { user: ana.id })).status).toBe(404)
    }))

  test('is not needed for /health, /docs, /v1/openapi.json or POST /v1/users', () =>
    withRollback(async ({ app }) => {
      expect((await call(app, 'GET', '/health')).status).toBe(200)
      expect((await call(app, 'GET', '/docs')).status).toBe(200)
      expect((await call(app, 'GET', '/v1/openapi.json')).status).toBe(200)
      expect((await call(app, 'POST', '/v1/users', { body: { name: 'Ana' } })).status).toBe(201)
    }))

  test('is still checked on POST /v1/users when sent', () =>
    withRollback(async ({ app }) => {
      const res = await call(app, 'POST', '/v1/users', { body: { name: 'Ana' }, headers: { 'x-user-id': UNKNOWN_USER } })

      expect(res.status).toBe(401)
    }))

  test('is documented as a security scheme, required except where it is not', () =>
    withRollback(async ({ app }) => {
      const doc = (await call(app, 'GET', '/v1/openapi.json')).body

      expect(doc.components.securitySchemes.ActingUser).toEqual(expect.objectContaining({ type: 'apiKey', in: 'header', name: 'X-User-Id' }))
      expect(doc.security).toEqual([{ ActingUser: [] }])
      expect(doc.paths['/health'].get.security).toEqual([])
      expect(doc.paths['/v1/users'].post.security).toEqual([{}, { ActingUser: [] }])
      expect(doc.paths['/v1/users'].get.security).toBeUndefined()
    }))
})
