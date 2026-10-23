import { Logo } from '@/components/Logo'

// Mostrado quando o .env.local não foi criado: orienta em vez de quebrar em branco.
export function ConfigMissing({ detail }: { detail: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <Logo />
      <h1 className="font-display text-2xl font-bold">Falta configurar o Supabase</h1>
      <p className="text-muted-foreground text-sm">
        Crie o arquivo <code className="text-foreground font-mono">.env.local</code> a partir do{' '}
        <code className="text-foreground font-mono">.env.example</code> com a URL e a chave “anon”
        do Supabase e reinicie o <code className="text-foreground font-mono">pnpm dev</code>. Veja o
        README.
      </p>
      <p className="text-destructive font-mono text-xs">{detail}</p>
    </div>
  )
}
