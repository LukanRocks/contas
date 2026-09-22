import { z } from 'zod'
import pkg from '../package.json' with { type: 'json' }

/** Compose passes unset variables through as empty strings; treat those as absent. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional())

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ })

const Env = z.object({
  DATABASE_URL: optional(postgresUrl),
  DATABASE_URL_TEST: optional(postgresUrl),
  PORT: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(65535).default(3000)),
  APP_VERSION: optional(z.string().trim().min(1)),
})

const parsed = Env.safeParse(process.env)

if (!parsed.success) throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`)

export const env = {
  ...parsed.data,
  /** Injected at Docker build time; a plain checkout reports the package version. */
  version: parsed.data.APP_VERSION ?? pkg.version,
}

/** For entry points that cannot run without a database. */
export function requireEnv(name: 'DATABASE_URL' | 'DATABASE_URL_TEST'): string {
  const value = env[name]

  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env at the workspace root.`)

  return value
}
