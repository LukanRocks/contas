import { CreateUser, UpdateUser, User, UserList, Uuid } from '@contas/contracts'
import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, json, jsonBody, problems } from '../../lib/router.ts'
import { createUser, deleteUser, getUser, listUsers, renameUser } from './service.ts'

const tags = ['Users']
const params = z.object({ id: Uuid })

// Either no credentials or X-User-Id. Typed apart: an inline `{}` here breaks zod-openapi's inference of the request body.
const optionalActingUser: Array<Record<string, string[]>> = [{}, { ActingUser: [] }]

const list = createRoute({
  method: 'get',
  path: '/v1/users',
  tags,
  summary: 'List every user',
  responses: { 200: json(UserList, 'All users, by name'), ...problems(401) },
})

const create = createRoute({
  method: 'post',
  path: '/v1/users',
  tags,
  summary: 'Create a user',
  description: 'Needs no X-User-Id. When one is sent it must be valid, and it is recorded as the actor in the audit log.',
  security: optionalActingUser,
  request: { body: jsonBody(CreateUser) },
  responses: { 201: json(User, 'The new user'), ...problems(400, 401, 422) },
})

const get = createRoute({
  method: 'get',
  path: '/v1/users/{id}',
  tags,
  summary: 'Get a user',
  request: { params },
  responses: { 200: json(User, 'The user'), ...problems(401, 404) },
})

const rename = createRoute({
  method: 'patch',
  path: '/v1/users/{id}',
  tags,
  summary: 'Rename a user',
  request: { params, body: jsonBody(UpdateUser) },
  responses: { 200: json(User, 'The renamed user'), ...problems(400, 401, 404, 422) },
})

const remove = createRoute({
  method: 'delete',
  path: '/v1/users/{id}',
  tags,
  summary: 'Delete a user',
  description: 'Refused while the user is the only owner of any space. Removes their memberships; transactions they created keep existing.',
  request: { params },
  responses: { 204: { description: 'Deleted' }, ...problems(401, 404, 409) },
})

export const userRoutes = createRouter()
  .openapi(list, async (context) => context.json({ data: await listUsers(context.var.db) }, 200))
  .openapi(create, async (context) => {
    const input = context.req.valid('json')
    // Unset when the request came without X-User-Id, which only this route allows.
    const actor = context.get('actor') ?? null
    const user = await context.var.db.transaction((tx) => createUser(tx, input, actor))

    return context.json(user, 201)
  })
  .openapi(get, async (context) => context.json(await getUser(context.var.db, context.req.valid('param').id), 200))
  .openapi(rename, async (context) => {
    const { id } = context.req.valid('param')
    const input = context.req.valid('json')
    const user = await context.var.db.transaction((tx) => renameUser(tx, id, input, context.var.actor))

    return context.json(user, 200)
  })
  .openapi(remove, async (context) => {
    const { id } = context.req.valid('param')

    await context.var.db.transaction((tx) => deleteUser(tx, id, context.var.actor))

    return context.body(null, 204)
  })
