import { AccountBalance, BalanceHistory, BalanceHistoryRequest, BalanceQuery, SpaceBalances, Uuid } from '@contas/contracts'
import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, json, jsonBody, problems } from '../../lib/router.ts'
import { getAccountBalance, getBalanceHistory, getSpaceBalances } from './service.ts'

const tags = ['Balances']
const spaceParams = z.object({ sid: Uuid })
const accountParams = z.object({ sid: Uuid, id: Uuid })

/** `at`, or now. The instant used is echoed back, so the answer says exactly what it covers. */
const instant = (at: string | undefined) => (at ? new Date(at) : new Date())

const accountBalance = createRoute({
  method: 'get',
  path: '/v1/spaces/{sid}/accounts/{id}/balance',
  tags,
  summary: "An account's balance at an instant",
  description: 'Computed from transactions: what flowed in minus what flowed out, up to and including `at`. Works for every kind of account.',
  request: { params: accountParams, query: BalanceQuery },
  responses: { 200: json(AccountBalance, "The balance, in the account's currency"), ...problems(401, 404, 422) },
})

const balanceHistory = createRoute({
  method: 'post',
  path: '/v1/spaces/{sid}/accounts/{id}/balance-history',
  tags,
  summary: "An account's balance over periods",
  description: [
    'Read-only, and open to viewers: a POST only because a year of daily edges does not fit in a query string.',
    'Every period is returned, empty and future ones included, their balance carried forward.',
  ].join(' '),
  request: { params: accountParams, body: jsonBody(BalanceHistoryRequest) },
  responses: { 200: json(BalanceHistory, 'One point per period'), ...problems(400, 401, 404, 422) },
})

const spaceBalances = createRoute({
  method: 'get',
  path: '/v1/spaces/{sid}/balances',
  tags,
  summary: 'What the space holds',
  description: 'Every managed account with its balance at `at`, and their totals per currency. Totals are never converted between currencies.',
  request: { params: spaceParams, query: BalanceQuery },
  responses: { 200: json(SpaceBalances, 'Balances and totals'), ...problems(401, 404, 422) },
})

export const balanceRoutes = createRouter()
  .openapi(accountBalance, async (context) => {
    const { id } = context.req.valid('param')

    return context.json(await getAccountBalance(context.var.db, context.var.space.id, id, instant(context.req.valid('query').at)), 200)
  })
  .openapi(balanceHistory, async (context) => {
    const { id } = context.req.valid('param')

    return context.json(await getBalanceHistory(context.var.db, context.var.space.id, id, context.req.valid('json').edges), 200)
  })
  .openapi(spaceBalances, async (context) => {
    const at = instant(context.req.valid('query').at)

    return context.json(await getSpaceBalances(context.var.db, context.var.space.id, at), 200)
  })
