import { supabase } from '@/lib/supabase'

/** Chama uma Edge Function e devolve a mensagem de erro dela em pt-BR. */
export async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: body as Record<string, unknown>,
  })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail =
      ctx && typeof ctx.json === 'function'
        ? ((await ctx.json().catch(() => null)) as { error?: string } | null)
        : null
    throw new Error(
      detail?.error ??
        (/Failed to send|fetch/i.test(error.message)
          ? 'Sem conexão com o servidor. Verifique a internet.'
          : 'Não foi possível concluir agora. Tente de novo.'),
    )
  }
  if (data === null || data === undefined) throw new Error('Resposta vazia do servidor.')
  return data
}
