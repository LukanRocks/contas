import { z } from 'zod'
import { Timestamp, Uuid } from './primitives.ts'
import { Role } from './spaces.ts'

export const Member = z
  .object({
    user_id: Uuid,
    user_name: z.string(),
    role: Role,
    created_at: Timestamp,
  })
  .meta({ id: 'Member' })
export type Member = z.infer<typeof Member>

export const MemberList = z.object({ data: z.array(Member) }).meta({ id: 'MemberList' })
export type MemberList = z.infer<typeof MemberList>

export const AddMember = z.strictObject({ user_id: Uuid, role: Role }).meta({ id: 'AddMember' })
export type AddMember = z.infer<typeof AddMember>

export const UpdateMember = z.strictObject({ role: Role }).meta({ id: 'UpdateMember' })
export type UpdateMember = z.infer<typeof UpdateMember>
