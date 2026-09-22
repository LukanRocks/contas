import { CurrencyList } from '@contas/contracts'
import { createRoute } from '@hono/zod-openapi'
import { createRouter, json, problems } from '../../lib/router.ts'
import { listCurrencies } from './service.ts'

const list = createRoute({
  method: 'get',
  path: '/v1/currencies',
  tags: ['Currencies'],
  summary: 'List the currencies accounts can use',
  description: 'Active ISO 4217 currencies, by code. Read-only.',
  responses: { 200: json(CurrencyList, 'Every currency, by code'), ...problems(401) },
})

export const currencyRoutes = createRouter().openapi(list, async (context) => context.json({ data: await listCurrencies(context.var.db) }, 200))
