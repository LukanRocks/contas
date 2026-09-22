import { z } from 'zod'
import { boundedName, Timestamp, Uuid } from './primitives.ts'

export const Role = z.enum(['owner', 'editor', 'viewer']).meta({ id: 'Role' })
export type Role = z.infer<typeof Role>

export const SpaceName = boundedName(100)

export const Space = z
  .object({
    id: Uuid,
    name: z.string(),
    role: Role.meta({ description: "The acting user's role in this space." }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: 'Space' })
export type Space = z.infer<typeof Space>

export const SpaceList = z.object({ data: z.array(Space) }).meta({ id: 'SpaceList' })
export type SpaceList = z.infer<typeof SpaceList>

export const CreateSpace = z.strictObject({ name: SpaceName }).meta({ id: 'CreateSpace' })
export type CreateSpace = z.infer<typeof CreateSpace>

export const UpdateSpace = z.strictObject({ name: SpaceName }).meta({ id: 'UpdateSpace' })
export type UpdateSpace = z.infer<typeof UpdateSpace>
