import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Bell, BellOff, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { usePush } from '@/features/push/usePush'
import { errorMessage } from '@/lib/errors'

const DISMISS_KEY = 'idex.pushDismissedAt'

function dismissedRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < 14 * 86_400_000
  } catch {
    return false
  }
}

/**
 * Aviso no celular. `compact` = cartão no Início (só aparece se ainda não
 * ativou); senão, bloco completo com ativar/desativar.
 */
export function PushCard({ compact = false }: { compact?: boolean }) {
  const { state, busy, enable, disable } = usePush()
  const [hidden, setHidden] = useState(() => compact && dismissedRecently())

  const turnOn = () =>
    void enable()
      .then(() => toast.success('Avisos ativados neste celular'))
      .catch((err) => toast.error(errorMessage(err)))

  if (compact && (hidden || !['off', 'needs-install'].includes(state))) return null
  if (state === 'loading') return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignora
    }
    setHidden(true)
  }

  return (
    <section
      aria-label="Avisos no celular"
      className="bg-card relative flex flex-col gap-3 rounded-2xl border p-4 pr-12"
    >
      {compact && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar"
          className="text-muted-foreground hover:text-foreground absolute top-1 right-1 flex size-11 items-center justify-center rounded-md"
        >
          <X className="size-4" />
        </button>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-primary text-xs font-semibold tracking-wider">AVISOS NO CELULAR</span>
        <span className="text-sm">
          {state === 'on'
            ? 'Ativados neste aparelho: lembrete da escala, ensaio do dia, pontos e pedidos.'
            : 'Receba no celular o lembrete da escala, o ensaio do dia e o resultado dos seus pedidos.'}
        </span>
      </div>
      {state === 'off' && (
        <Button className="self-start" disabled={busy} onClick={turnOn}>
          <Bell aria-hidden="true" /> {busy ? 'Ativando…' : 'Ativar avisos'}
        </Button>
      )}
      {state === 'on' && !compact && (
        <Button
          variant="outline"
          className="self-start"
          disabled={busy}
          onClick={() => void disable().then(() => toast.success('Avisos desativados'))}
        >
          <BellOff aria-hidden="true" /> Desativar neste celular
        </Button>
      )}
      {state === 'needs-install' && (
        <p className="text-muted-foreground text-sm">
          No iPhone os avisos só funcionam com o app instalado.{' '}
          <Link to="/instalar" className="text-primary underline">
            Ver como instalar
          </Link>
        </p>
      )}
      {state === 'denied' && (
        <p className="text-muted-foreground text-sm">
          As notificações estão bloqueadas. Libere nas configurações do navegador (ícone de cadeado
          ao lado do endereço) e volte aqui.
        </p>
      )}
      {state === 'unsupported' && (
        <p className="text-muted-foreground text-sm">
          Este navegador não recebe avisos. Use o Chrome no Android ou o app instalado no iPhone.
        </p>
      )}
    </section>
  )
}
