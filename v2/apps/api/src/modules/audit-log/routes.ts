import { AuditLog, AuditLogQuery, Uuid } from '@contas/contracts'
import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, json, problems } from '../../lib/router.ts'
import { listAuditLog } from './service.ts'

const list = createRoute({
  method: 'get',
  path: '/v1/spaces/{sid}/audit-log',
  tags: ['Audit log'],
  summary: "A space's audit log",
  description: [
    'Every create, update and delete on the space, its members, accounts and transactions, newest first, with before and after snapshots.',
    'Readable by any member. Paginated: pass `next_cursor` back as `cursor` until it is null.',
  ].join(' '),
  request: { params: z.object({ sid: Uuid }), query: AuditLogQuery },
  responses: { 200: json(AuditLog, 'A page of audit entries'), ...problems(400, 401, 404, 422) },
})

export const auditLogRoutes = createRouter().openapi(list, async (context) =>
  context.json(await listAuditLog(context.var.db, context.var.space.id, context.req.valid('query')), 200),
)
