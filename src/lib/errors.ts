// Traduz erros do Supabase (Auth, PostgREST, RPC) para mensagens em pt-BR.

type MaybeError = { message?: string; code?: string; status?: number } | null | undefined

const AUTH_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).',
  'User already registered': 'Já existe uma conta com este e-mail. Entre com ela.',
  'Password should be at least 6 characters.': 'A senha precisa ter pelo menos 6 caracteres.',
  'Signups not allowed for this instance': 'Cadastro desativado no momento.',
  'Email rate limit exceeded': 'Muitos e-mails enviados. Espere alguns minutos e tente de novo.',
}

export function errorMessage(error: unknown, fallback = 'Algo deu errado. Tente de novo.'): string {
  if (!error) return fallback
  if (typeof error === 'string') return error
  const err = error as MaybeError
  const message = err?.message ?? ''

  if (message in AUTH_MESSAGES) return AUTH_MESSAGES[message] ?? fallback
  if (/rate limit/i.test(message)) return AUTH_MESSAGES['Email rate limit exceeded'] ?? fallback
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return 'Sem conexão com o servidor. Verifique a internet.'
  }
  if (err?.code === '42501') return 'Você não tem permissão para fazer isso.'
  if (err?.code === '23505') return 'Já existe um registro com esses dados.'
  // Mensagens das nossas RPCs já vêm em português
  if (err?.code === '22023' || err?.code === 'P0002' || err?.code === '28000') return message
  return message || fallback
}
