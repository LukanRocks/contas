import { AddMember, Member, MemberList, UpdateMember, Uuid } from '@contas/contracts'
import { createRoute, z } from '@hono/zod-openapi'
import { forbidden } from '../../lib/errors.ts'
import { createRouter, json, jsonBody, problems } from '../../lib/router.ts'
import { requireRole } from '../../middleware/space-access.ts'
import { addMember, listMembers, removeMember, updateMemberRole } from './service.ts'

const tags = ['Members']
const spaceParams = z.object({ sid: Uuid })
const memberParams = z.object({ sid: Uuid, uid: Uuid })

const list = createRoute({
  method: 'get',
  path: '/v1/spaces/{sid}/members',
  tags,
  summary: "List a space's members",
  request: { params: spaceParams },
  responses: { 200: json(MemberList, 'The members, by name'), ...problems(401, 404) },
})

const add = createRoute({
  method: 'post',
  path: '/v1/spaces/{sid}/members',
  tags,
  summary: 'Add a member',
  description: 'Owners only. A user can be a member of a space only once.',
  middleware: [requireRole('owner')],
  request: { params: spaceParams, body: jsonBody(AddMember) },
  responses: { 201: json(Member, 'The new member'), ...problems(400, 401, 403, 404, 409, 422) },
})

const update = createRoute({
  method: 'patch',
  path: '/v1/spaces/{sid}/members/{uid}',
  tags,
  summary: "Change a member's role",
  description: 'Owners only. Demoting the last owner is refused.',
  middleware: [requireRole('owner')],
  request: { params: memberParams, body: jsonBody(UpdateMember) },
  responses: { 200: json(Member, 'The member with the new role'), ...problems(400, 401, 403, 404, 409, 422) },
})

const remove = createRoute({
  method: 'delete',
  path: '/v1/spaces/{sid}/members/{uid}',
  tags,
  summary: 'Remove a member',
  description: 'Owners can remove anyone, and any member can remove themselves; removing the last owner is refused.',
  request: { params: memberParams },
  responses: { 204: { description: 'Removed' }, ...problems(401, 403, 404, 409) },
})

export const memberRoutes = createRouter()
  .openapi(list, async (context) => context.json({ data: await listMembers(context.var.db, context.var.space.id) }, 200))
  .openapi(add, async (context) => {
    const input = context.req.valid('json')
    const member = await context.var.db.transaction((tx) => addMember(tx, context.var.space.id, input, context.var.actor))

    return context.json(member, 201)
  })
  .openapi(update, async (context) => {
    const { uid } = context.req.valid('param')
    const input = context.req.valid('json')
    const member = await context.var.db.transaction((tx) => updateMemberRole(tx, context.var.space.id, uid, input, context.var.actor))

    return context.json(member, 200)
  })
  .openapi(remove, async (context) => {
    const { uid } = context.req.valid('param')

    if (context.var.space.role !== 'owner' && uid !== context.var.actor.id) throw forbidden('Only owners can remove other members.')

    await context.var.db.transaction((tx) => removeMember(tx, context.var.space.id, uid, context.var.actor))

    return context.body(null, 204)
  })
