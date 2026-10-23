// Evita redirecionamento para outro site (open redirect)
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}
