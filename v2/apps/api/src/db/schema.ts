import { sql } from 'drizzle-orm'
import { bigint, check, foreignKey, index, jsonb, pgTable, primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

// Every timestamp is timestamptz: stored as an instant, always returned in UTC.
const timestamptz = (name: string) => timestamp(name, { withTimezone: true })

const timestamps = {
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
}

export const ROLES = ['owner', 'editor', 'viewer'] as const
export const ACCOUNT_KINDS = ['managed', 'unmanaged', 'system'] as const
export const AUDIT_ENTITY_TYPES = ['user', 'space', 'space_member', 'account', 'transaction'] as const
export const AUDIT_ACTIONS = ['create', 'update', 'delete'] as const

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    ...timestamps,
  },
  (table) => [check('users_name_check', sql`char_length(${table.name}) BETWEEN 1 AND 100`)],
)

export const spaces = pgTable(
  'spaces',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    ...timestamps,
  },
  (table) => [check('spaces_name_check', sql`char_length(${table.name}) BETWEEN 1 AND 100`)],
)

export const spaceMembers = pgTable(
  'space_members',
  {
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ROLES }).notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.spaceId, table.userId] }), check('space_members_role_check', sql`${table.role} IN ('owner', 'editor', 'viewer')`)],
)

/** Active ISO 4217 currencies, seeded by `seed-currencies.ts`. Read-only via the API. */
export const currencies = pgTable(
  'currencies',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    minorUnits: smallint('minor_units').notNull(),
  },
  (table) => [check('currencies_minor_units_check', sql`${table.minorUnits} BETWEEN 0 AND 18`)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ACCOUNT_KINDS }).notNull(),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    /** e.g. 'opening_balance', set exactly when kind = 'system'. */
    systemKey: text('system_key'),
    archivedAt: timestamptz('archived_at'),
    ...timestamps,
  },
  (table) => [
    check('accounts_name_check', sql`char_length(${table.name}) BETWEEN 1 AND 100`),
    check('accounts_kind_check', sql`${table.kind} IN ('managed', 'unmanaged', 'system')`),
    check('accounts_system_key_check', sql`(${table.kind} = 'system') = (${table.systemKey} IS NOT NULL)`),
    // Target for the composite foreign keys on transactions.
    unique('accounts_id_space_id_key').on(table.id, table.spaceId),
    uniqueIndex('accounts_space_name_uq').on(table.spaceId, sql`lower(${table.name})`),
    uniqueIndex('accounts_space_system_uq')
      .on(table.spaceId, table.systemKey, table.currencyCode)
      .where(sql`${table.systemKey} IS NOT NULL`),
  ],
)

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    fromAccountId: uuid('from_account_id').notNull(),
    toAccountId: uuid('to_account_id').notNull(),
    /** Minor units of the from account's currency. */
    fromValue: bigint('from_value', { mode: 'bigint' }).notNull(),
    /** Minor units of the to account's currency. */
    toValue: bigint('to_value', { mode: 'bigint' }).notNull(),
    occurredAt: timestamptz('occurred_at').notNull(),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    check('transactions_name_check', sql`char_length(${table.name}) BETWEEN 1 AND 200`),
    check('transactions_from_value_check', sql`${table.fromValue} > 0`),
    check('transactions_to_value_check', sql`${table.toValue} > 0`),
    check('transactions_accounts_differ_check', sql`${table.fromAccountId} <> ${table.toAccountId}`),
    // Composite keys guarantee both accounts belong to the transaction's space.
    // NO ACTION (not RESTRICT) is checked at the end of the statement, which
    // lets deleting a space cascade through accounts and transactions together.
    foreignKey({
      name: 'transactions_from_account_fk',
      columns: [table.fromAccountId, table.spaceId],
      foreignColumns: [accounts.id, accounts.spaceId],
    }).onDelete('no action'),
    foreignKey({
      name: 'transactions_to_account_fk',
      columns: [table.toAccountId, table.spaceId],
      foreignColumns: [accounts.id, accounts.spaceId],
    }).onDelete('no action'),
    index('transactions_from_idx').on(table.fromAccountId, table.occurredAt),
    index('transactions_to_idx').on(table.toAccountId, table.occurredAt),
    // Plain DESC (nulls first), so `ORDER BY occurred_at DESC, id DESC` can walk it.
    index('transactions_space_idx').on(table.spaceId, table.occurredAt.desc().nullsFirst(), table.id.desc().nullsFirst()),
  ],
)

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    /** NULL for user-level events. */
    spaceId: uuid('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
    entityType: text('entity_type', { enum: AUDIT_ENTITY_TYPES }).notNull(),
    /** A uuid, or "space_id:user_id" for memberships. */
    entityId: text('entity_id').notNull(),
    action: text('action', { enum: AUDIT_ACTIONS }).notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    /** No foreign key: the row outlives the user. */
    actorId: uuid('actor_id'),
    /** The actor's name when the row was written. */
    actorName: text('actor_name'),
    at: timestamptz('at').notNull().defaultNow(),
  },
  (table) => [
    check('audit_log_entity_type_check', sql`${table.entityType} IN ('user', 'space', 'space_member', 'account', 'transaction')`),
    check('audit_log_action_check', sql`${table.action} IN ('create', 'update', 'delete')`),
    index('audit_space_idx').on(table.spaceId, table.at.desc().nullsFirst(), table.id.desc().nullsFirst()),
    index('audit_entity_idx').on(table.entityType, table.entityId, table.at.desc().nullsFirst()),
  ],
)
