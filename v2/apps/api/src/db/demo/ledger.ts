/**
 * The demo dataset of the Finance API spec (§13), as typed constants.
 * Fully deterministic: every value and timestamp is fixed, so the numbers in §13.5 always hold.
 * Amounts are integer minor-unit strings ("1532.40" is "153240"), and every timestamp is UTC.
 * Rows the spec gives only a date for happen at 15:00Z on that date.
 */

export const DEMO_SUFFIX = '(demo)'

export type DemoUser = 'ana' | 'bruno' | 'carla'

export const USERS: Record<DemoUser, string> = {
  ana: 'Ana (demo)',
  bruno: 'Bruno (demo)',
  // No memberships: she proves spaces are visible to members only.
  carla: 'Carla (demo)',
}

export type DemoAccount = {
  /** How transactions below refer to it. */
  key: string
  name: string
  kind: 'managed' | 'unmanaged'
  currency: string
  openingBalance?: string
}

export type DemoTransaction = {
  name: string
  from: string
  to: string
  fromValue: string
  /** Only across currencies: within one, to_value defaults to from_value. */
  toValue?: string
  occurredAt: string
  actor: DemoUser
  /** A write made right after this transaction is recorded. */
  then?: { archive: string } | { update: { fromValue: string; toValue: string } } | 'delete'
}

export type DemoSpace = {
  name: string
  /** Everyone but Ana, who creates the space and so owns it. */
  members: Array<{ user: DemoUser; role: 'owner' | 'editor' | 'viewer' }>
  /** When every opening balance happens. */
  openedAt: string
  accounts: DemoAccount[]
  /** Recorded in occurred_at order, ties in the order listed. */
  transactions: DemoTransaction[]
}

/** 15:00Z on a date: the spec's rule for rows that give only a date. */
const on = (date: string) => `${date}T15:00:00Z`

/** The six transactions Casa repeats every month. Each card payment settles the previous month's card balance exactly. */
const monthly = (month: string, cardPayment: string): DemoTransaction[] => [
  { name: 'Salário', from: 'empregador', to: 'nubank', fromValue: '800000', occurredAt: on(`2026-${month}-05`), actor: 'ana' },
  { name: 'Aluguel', from: 'nubank', to: 'imobiliaria', fromValue: '220000', occurredAt: on(`2026-${month}-06`), actor: 'ana' },
  { name: 'Pagamento fatura', from: 'nubank', to: 'cartao', fromValue: cardPayment, occurredAt: on(`2026-${month}-10`), actor: 'ana' },
  { name: 'Supermercado', from: 'cartao', to: 'supermercado', fromValue: '65000', occurredAt: on(`2026-${month}-12`), actor: 'bruno' },
  { name: 'Energia', from: 'nubank', to: 'energia', fromValue: '18000', occurredAt: on(`2026-${month}-20`), actor: 'ana' },
  { name: 'Reserva', from: 'nubank', to: 'poupanca', fromValue: '100000', occurredAt: on(`2026-${month}-25`), actor: 'ana' },
]

export const CASA: DemoSpace = {
  name: 'Casa (demo)',
  members: [{ user: 'bruno', role: 'editor' }],
  openedAt: '2026-06-01T03:00:00Z',
  accounts: [
    { key: 'nubank', name: 'Nubank', kind: 'managed', currency: 'BRL', openingBalance: '320000' },
    { key: 'poupanca', name: 'Poupança', kind: 'managed', currency: 'BRL', openingBalance: '1000000' },
    { key: 'cartao', name: 'Cartão de Crédito', kind: 'managed', currency: 'BRL', openingBalance: '-150000' },
    { key: 'wise', name: 'Wise USD', kind: 'managed', currency: 'USD', openingBalance: '25000' },
    { key: 'bancoAntigo', name: 'Banco Antigo', kind: 'managed', currency: 'BRL', openingBalance: '80000' },
    { key: 'empregador', name: 'Empregador', kind: 'unmanaged', currency: 'BRL' },
    { key: 'imobiliaria', name: 'Imobiliária', kind: 'unmanaged', currency: 'BRL' },
    { key: 'supermercado', name: 'Supermercado', kind: 'unmanaged', currency: 'BRL' },
    { key: 'energia', name: 'Companhia de Energia', kind: 'unmanaged', currency: 'BRL' },
    { key: 'ifood', name: 'iFood', kind: 'unmanaged', currency: 'BRL' },
    { key: 'amazonBr', name: 'Amazon BR', kind: 'unmanaged', currency: 'BRL' },
    { key: 'amazonUs', name: 'Amazon US', kind: 'unmanaged', currency: 'USD' },
    { key: 'receita', name: 'Receita Federal', kind: 'unmanaged', currency: 'BRL' },
    { key: 'estudio', name: 'Estúdio Ana', kind: 'unmanaged', currency: 'BRL' },
  ],
  transactions: [
    ...monthly('06', '150000'),
    ...monthly('07', '73550'),
    ...monthly('08', '153240'),
    // The one-offs (§13.3 #1 to #10). The spec names no actor for them: Ana, who created the space and its accounts, makes them.
    // Its balance is 0 afterwards, so it is archived.
    {
      name: 'Encerramento conta',
      from: 'bancoAntigo',
      to: 'nubank',
      fromValue: '80000',
      occurredAt: on('2026-06-03'),
      actor: 'ana',
      then: { archive: 'bancoAntigo' },
    },
    { name: 'Jantar', from: 'cartao', to: 'ifood', fromValue: '8550', occurredAt: on('2026-06-15'), actor: 'ana' },
    { name: 'Pedido Amazon', from: 'cartao', to: 'amazonBr', fromValue: '30000', occurredAt: on('2026-07-08'), actor: 'ana' },
    { name: 'Teclado', from: 'cartao', to: 'amazonUs', fromValue: '50000', toValue: '9200', occurredAt: on('2026-07-14'), actor: 'ana' },
    // The fee is its own transaction.
    { name: 'IOF', from: 'cartao', to: 'receita', fromValue: '1750', occurredAt: on('2026-07-14'), actor: 'ana' },
    // 31 July, 22:30 in São Paulo: July there, August in UTC.
    { name: 'Pizza', from: 'cartao', to: 'ifood', fromValue: '6490', occurredAt: '2026-08-01T01:30:00Z', actor: 'ana' },
    { name: 'Conversão', from: 'wise', to: 'nubank', fromValue: '10000', toValue: '54500', occurredAt: on('2026-08-03'), actor: 'ana' },
    // Mirrors the Pró-labore paid out of the business space.
    { name: 'Pró-labore', from: 'estudio', to: 'nubank', fromValue: '400000', occurredAt: on('2026-08-05'), actor: 'ana' },
    // Then corrected, which produces an update audit row.
    {
      name: 'Feira',
      from: 'nubank',
      to: 'supermercado',
      fromValue: '12000',
      occurredAt: on('2026-08-18'),
      actor: 'ana',
      then: { update: { fromValue: '21000', toValue: '21000' } },
    },
    // Then deleted, which produces a delete audit row.
    { name: 'Lanche', from: 'nubank', to: 'ifood', fromValue: '5000', occurredAt: on('2026-08-22'), actor: 'ana', then: 'delete' },
  ],
}

export const ESTUDIO: DemoSpace = {
  name: 'Estúdio Ana (demo)',
  members: [{ user: 'bruno', role: 'viewer' }],
  openedAt: '2026-06-01T03:00:00Z',
  accounts: [
    { key: 'contaPj', name: 'Conta PJ', kind: 'managed', currency: 'BRL', openingBalance: '500000' },
    // No opening balance, but its Opening Balance USD account is still created, like for every new managed currency.
    { key: 'wiseBusiness', name: 'Wise Business', kind: 'managed', currency: 'USD' },
    { key: 'acme', name: 'Cliente Acme', kind: 'unmanaged', currency: 'BRL' },
    { key: 'globalInc', name: 'Cliente Global Inc', kind: 'unmanaged', currency: 'USD' },
    { key: 'contador', name: 'Contador', kind: 'unmanaged', currency: 'BRL' },
    { key: 'ana', name: 'Ana', kind: 'unmanaged', currency: 'BRL' },
  ],
  // All writes by Ana.
  transactions: [
    { name: 'Projeto site', from: 'acme', to: 'contaPj', fromValue: '600000', occurredAt: on('2026-06-20'), actor: 'ana' },
    { name: 'Projeto app', from: 'globalInc', to: 'wiseBusiness', fromValue: '120000', occurredAt: on('2026-07-15'), actor: 'ana' },
    { name: 'Conversão', from: 'wiseBusiness', to: 'contaPj', fromValue: '100000', toValue: '548000', occurredAt: on('2026-07-20'), actor: 'ana' },
    { name: 'Honorários contábeis', from: 'contaPj', to: 'contador', fromValue: '45000', occurredAt: on('2026-07-28'), actor: 'ana' },
    { name: 'Pró-labore', from: 'contaPj', to: 'ana', fromValue: '400000', occurredAt: on('2026-08-05'), actor: 'ana' },
  ],
}

export const SPACES = [CASA, ESTUDIO]
