import { CreateTransaction, Transaction, TransactionList, TransactionListQuery, UpdateTransaction, Uuid } from '@contas/contracts'
import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, json, jsonBody, problems } from '../../lib/router.ts'
import { requireRole } from '../../middleware/space-access.ts'
import { createTransaction, deleteTransaction, getTransaction, listTransactions, updateTransaction } from './service.ts'

const tags = ['Transactions']
const spaceParams = z.object({ sid: Uuid })
const transactionParams = z.object({ sid: Uuid, id: Uuid })

const RULES = [
  'Both accounts must be in this space and differ, at least one must be managed, and neither may be newly archived.',
  'Between accounts of one currency the two values must be equal, and to_value defaults to from_value.',
  'Across currencies both values are required.',
].join(' ')

const list = createRoute({
  method: 'get',
  path: '/v1/spaces/{sid}/transactions',
  tags,
  summary: "List a space's transactions",
  description: 'Newest first. Paginated: pass `next_cursor` back as `cursor` until it is null.',
  request: { params: spaceParams, query: TransactionListQuery },
  responses: { 200: json(TransactionList, 'A page of transactions'), ...problems(400, 401, 404, 422) },
})

const create = createRoute({
  method: 'post',
  path: '/v1/spaces/{sid}/transactions',
  tags,
  summary: 'Record a transaction',
  description: `Editors and owners. ${RULES}`,
  middleware: [requireRole('editor')],
  request: { params: spaceParams, body: jsonBody(CreateTransaction) },
  responses: { 201: json(Transaction, 'The new transaction'), ...problems(400, 401, 403, 404, 422) },
})

const get = createRoute({
  method: 'get',
  path: '/v1/spaces/{sid}/transactions/{id}',
  tags,
  summary: 'Get a transaction',
  request: { params: transactionParams },
  responses: { 200: json(Transaction, 'The transaction'), ...problems(401, 404) },
})

const update = createRoute({
  method: 'patch',
  path: '/v1/spaces/{sid}/transactions/{id}',
  tags,
  summary: 'Change a transaction',
  description: [
    `Editors and owners. Any subset of the create fields, checked together with the rest: ${RULES}`,
    "Moving a side to an account of another currency also needs that side's value, so an old value is never read in a new currency.",
  ].join(' '),
  middleware: [requireRole('editor')],
  request: { params: transactionParams, body: jsonBody(UpdateTransaction) },
  responses: { 200: json(Transaction, 'The changed transaction'), ...problems(400, 401, 403, 404, 422) },
})

const remove = createRoute({
  method: 'delete',
  path: '/v1/spaces/{sid}/transactions/{id}',
  tags,
  summary: 'Delete a transaction',
  description: 'Editors and owners.',
  middleware: [requireRole('editor')],
  request: { params: transactionParams },
  responses: { 204: { description: 'Deleted' }, ...problems(401, 403, 404) },
})

export const transactionRoutes = createRouter()
  .openapi(list, async (context) => context.json(await listTransactions(context.var.db, context.var.space.id, context.req.valid('query')), 200))
  .openapi(create, async (context) => {
    const input = context.req.valid('json')
    const transaction = await context.var.db.transaction((tx) => createTransaction(tx, context.var.space.id, input, context.var.actor))

    return context.json(transaction, 201)
  })
  .openapi(get, async (context) => context.json(await getTransaction(context.var.db, context.var.space.id, context.req.valid('param').id), 200))
  .openapi(update, async (context) => {
    const { id } = context.req.valid('param')
    const input = context.req.valid('json')
    const transaction = await context.var.db.transaction((tx) => updateTransaction(tx, context.var.space.id, id, input, context.var.actor))

    return context.json(transaction, 200)
  })
  .openapi(remove, async (context) => {
    const { id } = context.req.valid('param')

    await context.var.db.transaction((tx) => deleteTransaction(tx, context.var.space.id, id, context.var.actor))

    return context.body(null, 204)
  })
