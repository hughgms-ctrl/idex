import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'

import { isIos, isStandalone, type BeforeInstallPromptEvent } from '@/components/pwa/install'
import { Button } from '@/components/ui/button'

const DISMISS_KEY = 'idex.installDismissedAt'
const DISMISS_DAYS = 14

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
    return Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

// Banner "Instalar app": Android/Chrome usa o prompt nativo; iPhone mostra o passo a passo.
export function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(() => isStandalone() || recentlyDismissed())
  const ios = isIos()

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (hidden || (!promptEvent && !ios)) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignora
    }
    setHidden(true)
  }

  const install = async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    setPromptEvent(null)
    if (outcome === 'accepted') setHidden(true)
  }

  return (
    <section
      aria-label="Instalar o app"
      className="bg-card relative flex flex-col gap-3 rounded-2xl border p-4 pr-12"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fechar aviso de instalação"
        className="text-muted-foreground hover:text-foreground absolute top-1 right-1 flex size-11 items-center justify-center rounded-md"
      >
        <X className="size-4" />
      </button>
      <div className="flex flex-col gap-1">
        <span className="text-primary text-xs font-semibold tracking-wider">INSTALAR APP</span>
        <span className="text-sm">
          Tenha o ide.x na tela inicial: abre mais rápido e mostra sua escala mesmo sem internet.
        </span>
      </div>
      {promptEvent ? (
        <Button onClick={() => void install()} className="self-start">
          <Download aria-hidden="true" /> Instalar
        </Button>
      ) : (
        <ol className="text-muted-foreground flex flex-col gap-2 text-sm">
          <li className="flex items-center gap-2">
            <span className="font-mono text-xs">1.</span> Toque em
            <Share className="text-foreground size-4" aria-label="Compartilhar" />
            <strong className="text-foreground">Compartilhar</strong> no Safari
          </li>
          <li className="flex items-center gap-2">
            <span className="font-mono text-xs">2.</span> Escolha
            <SquarePlus className="text-foreground size-4" aria-hidden="true" />
            <strong className="text-foreground">Adicionar à Tela de Início</strong>
          </li>
        </ol>
      )}
    </section>
  )
}
