import { z } from 'zod'
import { boundedName, Timestamp, Uuid } from './primitives.ts'

export const UserName = boundedName(100)

export const User = z
  .object({
    id: Uuid,
    name: z.string(),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: 'User' })
export type User = z.infer<typeof User>

export const UserList = z.object({ data: z.array(User) }).meta({ id: 'UserList' })
export type UserList = z.infer<typeof UserList>

export const CreateUser = z.strictObject({ name: UserName }).meta({ id: 'CreateUser' })
export type CreateUser = z.infer<typeof CreateUser>

export const UpdateUser = z.strictObject({ name: UserName }).meta({ id: 'UpdateUser' })
export type UpdateUser = z.infer<typeof UpdateUser>
