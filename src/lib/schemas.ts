import { z } from 'zod'

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Informe um e-mail válido' }))
const password = z.string().min(6, { message: 'A senha precisa ter pelo menos 6 caracteres' })
const fullName = z
  .string()
  .trim()
  .min(2, { message: 'Informe seu nome' })
  .max(120, { message: 'Nome muito longo' })

export const loginSchema = z.object({ email, password })
export const magicLinkSchema = z.object({ email })
export const signUpSchema = z.object({ fullName, email, password })

export const churchSchema = z.object({
  churchName: z
    .string()
    .trim()
    .min(2, { message: 'Informe o nome da igreja' })
    .max(120, { message: 'Nome muito longo' }),
  ministryName: z.string().trim().min(2, { message: 'Informe o nome do ministério' }).max(80),
})

export const inviteSchema = z.object({
  role: z.enum(['member', 'leader']),
  ministryRoleIds: z.array(z.uuid()),
  multiUse: z.boolean(),
  expiresInDays: z.number().int().min(1).max(30),
  email: z.union([z.literal(''), email]),
})

export const ministrySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: 'Informe o nome' })
    .max(80, { message: 'Nome muito longo' }),
  kind: z.enum(['worship', 'media', 'kids', 'reception', 'other']),
})

export const roleNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Informe o nome da função' })
  .max(60, { message: 'Nome muito longo' })

export type LoginInput = z.infer<typeof loginSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
export type ChurchInput = z.infer<typeof churchSchema>
export type InviteInput = z.infer<typeof inviteSchema>
export type MinistryInput = z.infer<typeof ministrySchema>

export const MINISTRY_KIND_LABEL: Record<MinistryInput['kind'], string> = {
  worship: 'Louvor',
  media: 'Mídia',
  kids: 'Infantil',
  reception: 'Recepção',
  other: 'Outro',
}
