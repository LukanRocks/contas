import { describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'
import { spaceMembers } from '../src/db/schema.ts'
import { newId } from '../src/lib/ids.ts'
import { addMember, auditOf, call, createCast, createUser, withRollback } from './helpers.ts'

const members = (sid: string) => `/v1/spaces/${sid}/members`
const member = (sid: string, uid: string) => `/v1/spaces/${sid}/members/${uid}`

describe('GET /v1/spaces/:sid/members', () => {
  test('lists members with their names and roles, by name, to any member', () =>
    withRollback(async ({ app, db }) => {
      const { owner, editor, viewer, space } = await createCast(db)
      const res = await call(app, 'GET', members(space.id), { user: viewer.id })

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([
        { user_id: editor.id, user_name: 'Editor', role: 'editor', created_at: expect.any(String) },
        { user_id: owner.id, user_name: 'Owner', role: 'owner', created_at: expect.any(String) },
        { user_id: viewer.id, user_name: 'Viewer', role: 'viewer', created_at: expect.any(String) },
      ])
    }))

  test('is 404 for a non-member', () =>
    withRollback(async ({ app, db }) => {
      const { outsider, space } = await createCast(db)

      expect((await call(app, 'GET', members(space.id), { user: outsider.id })).status).toBe(404)
    }))
})

describe('POST /v1/spaces/:sid/members', () => {
  test('lets the owner add a member, auditing it', () =>
    withRollback(async ({ app, db }) => {
      const { owner, outsider, space } = await createCast(db)
      const res = await call(app, 'POST', members(space.id), { user: owner.id, body: { user_id: outsider.id, role: 'editor' } })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ user_id: outsider.id, user_name: 'Outsider', role: 'editor', created_at: expect.any(String) })

      const [row] = await auditOf(db, 'space_member', `${space.id}:${outsider.id}`)

      expect(row).toMatchObject({ spaceId: space.id, action: 'create', before: null, after: res.body, actorId: owner.id })
    }))

  test('is 409 for someone who is already a member', () =>
    withRollback(async ({ app, db }) => {
      const { owner, viewer, space } = await createCast(db)
      const res = await call(app, 'POST', members(space.id), { user: owner.id, body: { user_id: viewer.id, role: 'editor' } })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('conflict')
    }))

  test('is 422 for an unknown user or role', () =>
    withRollback(async ({ app, db }) => {
      const { owner, outsider, space } = await createCast(db)
      const unknown = await call(app, 'POST', members(space.id), { user: owner.id, body: { user_id: newId(), role: 'editor' } })
      const badRole = await call(app, 'POST', members(space.id), { user: owner.id, body: { user_id: outsider.id, role: 'admin' } })

      expect(unknown.status).toBe(422)
      expect(unknown.body.errors).toEqual([{ path: 'user_id', message: expect.any(String) }])
      expect(badRole.status).toBe(422)
      expect(badRole.body.errors[0].path).toBe('role')
    }))
})

describe('PATCH /v1/spaces/:sid/members/:uid', () => {
  test("lets the owner change a member's role, auditing before and after", () =>
    withRollback(async ({ app, db }) => {
      const { owner, editor, space } = await createCast(db)
      const res = await call(app, 'PATCH', member(space.id, editor.id), { user: owner.id, body: { role: 'viewer' } })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ user_id: editor.id, role: 'viewer' })

      const [, update] = await auditOf(db, 'space_member', `${space.id}:${editor.id}`)

      expect(update).toMatchObject({ action: 'update', before: expect.objectContaining({ role: 'editor' }), after: res.body, actorId: owner.id })
    }))

  test('is 409 when it would demote the last owner', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const res = await call(app, 'PATCH', member(space.id, owner.id), { user: owner.id, body: { role: 'editor' } })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('conflict')
    }))

  test('lets an owner step down while another owner remains', () =>
    withRollback(async ({ app, db }) => {
      const { owner, editor, space } = await createCast(db)

      await call(app, 'PATCH', member(space.id, editor.id), { user: owner.id, body: { role: 'owner' } })

      expect((await call(app, 'PATCH', member(space.id, owner.id), { user: owner.id, body: { role: 'viewer' } })).status).toBe(200)
      expect((await call(app, 'PATCH', member(space.id, editor.id), { user: editor.id, body: { role: 'viewer' } })).status).toBe(409)
    }))

  test('is 404 for someone who is not a member', () =>
    withRollback(async ({ app, db }) => {
      const { owner, outsider, space } = await createCast(db)

      expect((await call(app, 'PATCH', member(space.id, outsider.id), { user: owner.id, body: { role: 'viewer' } })).status).toBe(404)
      expect((await call(app, 'PATCH', member(space.id, 'nope'), { user: owner.id, body: { role: 'viewer' } })).status).toBe(404)
    }))
})

describe('DELETE /v1/spaces/:sid/members/:uid', () => {
  test('lets the owner remove a member, auditing it', () =>
    withRollback(async ({ app, db }) => {
      const { owner, editor, space } = await createCast(db)

      expect((await call(app, 'DELETE', member(space.id, editor.id), { user: owner.id })).status).toBe(204)

      const [, removed] = await auditOf(db, 'space_member', `${space.id}:${editor.id}`)

      expect(removed).toMatchObject({
        spaceId: space.id,
        action: 'delete',
        before: expect.objectContaining({ user_id: editor.id, role: 'editor' }),
        after: null,
      })
      expect((await call(app, 'GET', `/v1/spaces/${space.id}`, { user: editor.id })).status).toBe(404)
    }))

  test('lets any member remove themselves', () =>
    withRollback(async ({ app, db }) => {
      const { editor, viewer, space } = await createCast(db)

      for (const user of [editor, viewer]) expect((await call(app, 'DELETE', member(space.id, user.id), { user: user.id })).status).toBe(204)
    }))

  test('is 403 for a non-owner removing someone else', () =>
    withRollback(async ({ app, db }) => {
      const { owner, editor, viewer, outsider, space } = await createCast(db)

      expect((await call(app, 'DELETE', member(space.id, viewer.id), { user: editor.id })).status).toBe(403)
      expect((await call(app, 'DELETE', member(space.id, owner.id), { user: viewer.id })).status).toBe(403)
      // The role check comes first, so a non-owner learns nothing about who is a member.
      expect((await call(app, 'DELETE', member(space.id, outsider.id), { user: viewer.id })).status).toBe(403)
    }))

  test('is 409 for the last owner, even removing themselves', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const res = await call(app, 'DELETE', member(space.id, owner.id), { user: owner.id })

      expect(res.status).toBe(409)
      expect(await db.select().from(spaceMembers).where(and(eq(spaceMembers.spaceId, space.id), eq(spaceMembers.userId, owner.id)))).toHaveLength(1)
    }))

  test('lets one of two owners go', () =>
    withRollback(async ({ app, db }) => {
      const { owner, space } = await createCast(db)
      const second = await createUser(db, 'Second')

      await addMember(db, space, owner, second, 'owner')

      expect((await call(app, 'DELETE', member(space.id, owner.id), { user: second.id })).status).toBe(204)
    }))

  test('is 404 for someone who is not a member', () =>
    withRollback(async ({ app, db }) => {
      const { owner, outsider, space } = await createCast(db)

      expect((await call(app, 'DELETE', member(space.id, outsider.id), { user: owner.id })).status).toBe(404)
    }))
})
