import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url({ message: 'VITE_SUPABASE_URL ausente ou inválida' }),
  VITE_SUPABASE_ANON_KEY: z.string().min(20, { message: 'VITE_SUPABASE_ANON_KEY ausente' }),
})

const parsed = envSchema.safeParse(import.meta.env)

export const envError = parsed.success
  ? null
  : parsed.error.issues.map((issue) => issue.message).join(' · ')

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

// Supabase local + app aberto de outro aparelho (celular na rede, túnel):
// usa o repasse /supabase do servidor do Vite em vez de 127.0.0.1.
export function resolveSupabaseUrl(
  configured: string,
  location: Pick<Location, 'hostname' | 'origin'> | undefined,
): string {
  if (!location) return configured
  const target = new URL(configured)
  const supabaseIsLocal = LOCAL_HOSTS.includes(target.hostname)
  const appIsLocal = LOCAL_HOSTS.includes(location.hostname)
  if (import.meta.env.DEV && supabaseIsLocal && !appIsLocal) return `${location.origin}/supabase`
  return configured
}

const raw = parsed.success
  ? parsed.data
  : { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'missing' }

export const env = {
  ...raw,
  VITE_SUPABASE_URL: resolveSupabaseUrl(raw.VITE_SUPABASE_URL, globalThis.location),
}
