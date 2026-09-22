import { Account, AccountList, AccountListQuery, CreateAccount, UpdateAccount, Uuid } from '@contas/contracts'
import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, json, jsonBody, problems } from '../../lib/router.ts'
import { requireRole } from '../../middleware/space-access.ts'
import { createAccount, deleteAccount, getAccount, listAccounts, updateAccount } from './service.ts'

const tags = ['Accounts']
const spaceParams = z.object({ sid: Uuid })
const accountParams = z.object({ sid: Uuid, id: Uuid })

const list = createRoute({
  method: 'get',
  path: '/v1/spaces/{sid}/accounts',
  tags,
  summary: "List a space's accounts",
  description: 'Active accounts unless `archived` says otherwise, by name.',
  request: { params: spaceParams, query: AccountListQuery },
  responses: { 200: json(AccountList, 'The accounts'), ...problems(401, 404, 422) },
})

const create = createRoute({
  method: 'post',
  path: '/v1/spaces/{sid}/accounts',
  tags,
  summary: 'Create an account',
  description: [
    'Editors and owners. Only managed and unmanaged accounts: system accounts are created by the server.',
    "A managed account also creates the space's Opening Balance account for its currency, if there is none yet,",
    'and its `opening_balance`, if not zero, as a transaction against it.',
  ].join(' '),
  middleware: [requireRole('editor')],
  request: { params: spaceParams, body: jsonBody(CreateAccount) },
  responses: { 201: json(Account, 'The new account'), ...problems(400, 401, 403, 404, 409, 422) },
})

const get = createRoute({
  method: 'get',
  path: '/v1/spaces/{sid}/accounts/{id}',
  tags,
  summary: 'Get an account',
  request: { params: accountParams },
  responses: { 200: json(Account, 'The account'), ...problems(401, 404) },
})

const update = createRoute({
  method: 'patch',
  path: '/v1/spaces/{sid}/accounts/{id}',
  tags,
  summary: 'Rename, re-currency or archive an account',
  description: 'Editors and owners. `kind` cannot change, `currency_code` only while no transaction uses the account, and system accounts not at all.',
  middleware: [requireRole('editor')],
  request: { params: accountParams, body: jsonBody(UpdateAccount) },
  responses: { 200: json(Account, 'The updated account'), ...problems(400, 401, 403, 404, 409, 422) },
})

const remove = createRoute({
  method: 'delete',
  path: '/v1/spaces/{sid}/accounts/{id}',
  tags,
  summary: 'Delete an account',
  description: 'Editors and owners. Refused for accounts that transactions use (archive those instead), and for system accounts.',
  middleware: [requireRole('editor')],
  request: { params: accountParams },
  responses: { 204: { description: 'Deleted' }, ...problems(401, 403, 404, 409) },
})

export const accountRoutes = createRouter()
  .openapi(list, async (context) => context.json({ data: await listAccounts(context.var.db, context.var.space.id, context.req.valid('query')) }, 200))
  .openapi(create, async (context) => {
    const input = context.req.valid('json')
    const account = await context.var.db.transaction((tx) => createAccount(tx, context.var.space.id, input, context.var.actor))

    return context.json(account, 201)
  })
  .openapi(get, async (context) => context.json(await getAccount(context.var.db, context.var.space.id, context.req.valid('param').id), 200))
  .openapi(update, async (context) => {
    const { id } = context.req.valid('param')
    const input = context.req.valid('json')
    const account = await context.var.db.transaction((tx) => updateAccount(tx, context.var.space.id, id, input, context.var.actor))

    return context.json(account, 200)
  })
  .openapi(remove, async (context) => {
    const { id } = context.req.valid('param')

    await context.var.db.transaction((tx) => deleteAccount(tx, context.var.space.id, id, context.var.actor))

    return context.body(null, 204)
  })
