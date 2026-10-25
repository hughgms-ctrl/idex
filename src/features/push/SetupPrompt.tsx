import { useState } from 'react'
import { toast } from 'sonner'
import { Bell, Download, Share, SquarePlus } from 'lucide-react'

import { isIos } from '@/components/pwa/install'
import { useInstallPrompt } from '@/components/pwa/install-prompt'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { isAndroidEdge, isMobile, setupStep } from '@/features/push/setup'
import { usePush } from '@/features/push/usePush'
import { errorMessage } from '@/lib/errors'

// "Agora não" vale só até fechar o app: na próxima vez que abrir, pergunta de novo.
const SNOOZE_KEY = 'idex.setupSnoozed'

function snoozed(): boolean {
  try {
    return sessionStorage.getItem(SNOOZE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Toda vez que a pessoa abre o app no celular sem poder receber avisos na tela,
 * aparece este pedido: instalar (iPhone) e ativar os avisos neste aparelho.
 */
export function SetupPrompt() {
  const push = usePush()
  const { canPrompt, installed, install } = useInstallPrompt()
  const [closed, setClosed] = useState(snoozed)
  const step = setupStep({ mobile: isMobile(), push: push.state })

  if (closed || !step) return null

  const later = () => {
    try {
      sessionStorage.setItem(SNOOZE_KEY, '1')
    } catch {
      // ignora
    }
    setClosed(true)
  }

  const turnOn = () =>
    void push
      .enable()
      .then(async () => {
        await push.test().catch(() => undefined)
        toast.success('Avisos ativados! Em até 1 minuto chega um aviso de teste na tela.', {
          duration: 10_000,
        })
      })
      .catch((err) => toast.error(errorMessage(err)))

  const android = !isIos()

  return (
    <Dialog open onOpenChange={(open) => !open && later()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receba os avisos no celular</DialogTitle>
          <DialogDescription>
            Escala, ensaio, mudança de horário e recados do líder aparecem na tela do celular, igual
            mensagem de aplicativo.
          </DialogDescription>
        </DialogHeader>

        {step === 'install-ios' && (
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex items-center gap-2">
              <span className="text-primary font-mono text-xs">1.</span> No Safari, toque em
              <Share className="size-4" aria-label="Compartilhar" />
              <strong>Compartilhar</strong>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary font-mono text-xs">2.</span> Escolha
              <SquarePlus className="size-4" aria-hidden="true" />
              <strong>Adicionar à Tela de Início</strong>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-mono text-xs">3.</span>
              <span>
                Abra o <strong>ide.x pelo ícone</strong> na tela de início e toque em{' '}
                <strong>Ativar avisos</strong>.
              </span>
            </li>
            <li className="text-muted-foreground text-xs">
              No iPhone os avisos só funcionam com o app instalado (iOS 16.4 ou mais novo).
            </li>
          </ol>
        )}

        {step === 'enable' && (
          <div className="flex flex-col gap-3 text-sm">
            {android && canPrompt && !installed && (
              <Button variant="outline" onClick={() => void install()}>
                <Download aria-hidden="true" /> Instalar o app na tela inicial
              </Button>
            )}
            <p>
              Toque em <strong>Ativar avisos</strong> e depois em <strong>Permitir</strong> quando o
              celular perguntar.
            </p>
          </div>
        )}

        {step === 'denied' && (
          <div className="flex flex-col gap-2 text-sm">
            <p>As notificações do ide.x estão bloqueadas neste celular. Para liberar:</p>
            {android ? (
              <p className="text-muted-foreground">
                Configurações do celular → <strong>Apps</strong> → <strong>ide.x</strong> (ou
                Chrome) → <strong>Notificações</strong> → ativar. Depois feche e abra o app.
              </p>
            ) : (
              <p className="text-muted-foreground">
                <strong>Ajustes</strong> → <strong>Notificações</strong> → <strong>ide.x</strong> →
                ativar “Permitir Notificações”. Depois feche e abra o app.
              </p>
            )}
          </div>
        )}

        {step === 'unsupported' && (
          <p className="text-sm">
            {isAndroidEdge()
              ? 'O Microsoft Edge do Android não recebe avisos de sites. Abra o ide.x no Google Chrome, instale por lá (⋮ → Instalar app) e ative os avisos.'
              : android
                ? 'Este navegador não recebe avisos. Abra o ide.x pelo Google Chrome e ative por lá.'
                : 'Este navegador não recebe avisos. Instale o app pelo Safari e abra pelo ícone.'}
          </p>
        )}

        <DialogFooter>
          {step === 'enable' && (
            <Button size="lg" disabled={push.busy} onClick={turnOn}>
              <Bell aria-hidden="true" /> {push.busy ? 'Ativando…' : 'Ativar avisos'}
            </Button>
          )}
          <Button variant="ghost" onClick={later}>
            Agora não
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
