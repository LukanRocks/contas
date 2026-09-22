import { CreateSpace, Space, SpaceList, UpdateSpace, Uuid } from '@contas/contracts'
import { createRoute, z } from '@hono/zod-openapi'
import { requireRole } from '../../middleware/space-access.ts'
import { createRouter, json, jsonBody, problems } from '../../lib/router.ts'
import { createSpace, deleteSpace, getSpace, listSpaces, renameSpace } from './service.ts'

const tags = ['Spaces']
const params = z.object({ sid: Uuid })

const list = createRoute({
  method: 'get',
  path: '/v1/spaces',
  tags,
  summary: 'List your spaces',
  description: 'Only the spaces the acting user belongs to, each with their role in it.',
  responses: { 200: json(SpaceList, 'Your spaces, by name'), ...problems(401) },
})

const create = createRoute({
  method: 'post',
  path: '/v1/spaces',
  tags,
  summary: 'Create a space',
  description: 'The acting user becomes its owner.',
  request: { body: jsonBody(CreateSpace) },
  responses: { 201: json(Space, 'The new space'), ...problems(400, 401, 422) },
})

const get = createRoute({
  method: 'get',
  path: '/v1/spaces/{sid}',
  tags,
  summary: 'Get a space',
  request: { params },
  responses: { 200: json(Space, 'The space'), ...problems(401, 404) },
})

const rename = createRoute({
  method: 'patch',
  path: '/v1/spaces/{sid}',
  tags,
  summary: 'Rename a space',
  description: 'Owners only.',
  middleware: [requireRole('owner')],
  request: { params, body: jsonBody(UpdateSpace) },
  responses: { 200: json(Space, 'The renamed space'), ...problems(400, 401, 403, 404, 422) },
})

const remove = createRoute({
  method: 'delete',
  path: '/v1/spaces/{sid}',
  tags,
  summary: 'Delete a space',
  description: 'Owners only. Permanently deletes everything in it: members, accounts, transactions and its audit log.',
  middleware: [requireRole('owner')],
  request: { params },
  responses: { 204: { description: 'Deleted' }, ...problems(401, 403, 404) },
})

export const spaceRoutes = createRouter()
  .openapi(list, async (context) => context.json({ data: await listSpaces(context.var.db, context.var.actor.id) }, 200))
  .openapi(create, async (context) => {
    const input = context.req.valid('json')
    const space = await context.var.db.transaction((tx) => createSpace(tx, input, context.var.actor))

    return context.json(space, 201)
  })
  .openapi(get, async (context) => context.json(await getSpace(context.var.db, context.var.space), 200))
  .openapi(rename, async (context) => {
    const input = context.req.valid('json')
    const space = await context.var.db.transaction((tx) => renameSpace(tx, context.var.space, input, context.var.actor))

    return context.json(space, 200)
  })
  .openapi(remove, async (context) => {
    await context.var.db.transaction((tx) => deleteSpace(tx, context.var.space))

    return context.body(null, 204)
  })
