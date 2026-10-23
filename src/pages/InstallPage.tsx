import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { CheckCircle2, Download, EllipsisVertical, Share, SquarePlus } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Section'
import { isIos } from '@/components/pwa/install'
import { useInstallPrompt } from '@/components/pwa/install-prompt'
import { Button } from '@/components/ui/button'
import { PushCard } from '@/features/push/PushCard'

// Instalar o app no celular e ativar os avisos (último passo do primeiro acesso).
export function InstallPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const onboarding = params.get('inicio') === '1'
  const { canPrompt, installed, install } = useInstallPrompt()
  const ios = isIos()

  return (
    <>
      <PageHeader
        eyebrow={onboarding ? 'PASSO 3 DE 3' : undefined}
        title="Instale o app no celular"
        description="Com o ide.x na tela inicial, ele abre como aplicativo, mostra sua escala e as cifras mesmo sem internet e pode mandar avisos."
      />

      {installed ? (
        <Panel className="flex-row items-center gap-3">
          <CheckCircle2 className="text-primary size-6 shrink-0" aria-hidden="true" />
          <span className="text-sm">O app já está instalado neste aparelho.</span>
        </Panel>
      ) : (
        <>
          {canPrompt && (
            <Button
              size="lg"
              className="min-h-14 rounded-2xl text-[17px]"
              onClick={() =>
                void install().then((ok) => ok && toast.success('App instalado na tela inicial'))
              }
            >
              <Download aria-hidden="true" /> Instalar agora
            </Button>
          )}
          {/* instruções do aparelho em uso primeiro */}
          <div className={ios ? 'flex flex-col gap-5' : 'flex flex-col-reverse gap-5'}>
            <Panel>
              <h2 className="text-[15px] font-semibold">No iPhone (Safari)</h2>
              <ol className="text-muted-foreground flex flex-col gap-2.5 text-sm">
                <li className="flex items-start gap-2">
                  <Step n={1} />
                  <span className="pt-0.5">
                    Abra este endereço no <strong className="text-foreground">Safari</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Step n={2} />
                  <span className="pt-0.5">
                    Toque em{' '}
                    <Share
                      className="text-foreground inline size-4 align-text-bottom"
                      aria-label="Compartilhar"
                    />{' '}
                    <strong className="text-foreground">Compartilhar</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Step n={3} />
                  <span className="pt-0.5">
                    Escolha{' '}
                    <SquarePlus
                      className="text-foreground inline size-4 align-text-bottom"
                      aria-hidden="true"
                    />{' '}
                    <strong className="text-foreground">Adicionar à Tela de Início</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Step n={4} />
                  <span className="pt-0.5">
                    Abra o ide.x pelo ícone novo e ative os avisos abaixo
                  </span>
                </li>
              </ol>
            </Panel>
            <Panel>
              <h2 className="text-[15px] font-semibold">No Android (Chrome)</h2>
              <ol className="text-muted-foreground flex flex-col gap-2.5 text-sm">
                <li className="flex items-start gap-2">
                  <Step n={1} />
                  <span className="pt-0.5">
                    Toque em <strong className="text-foreground">Instalar agora</strong> (se
                    aparecer) ou no menu{' '}
                    <EllipsisVertical
                      className="text-foreground inline size-4 align-text-bottom"
                      aria-label="menu"
                    />
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Step n={2} />
                  <span className="pt-0.5">
                    Escolha <strong className="text-foreground">Instalar app</strong> ou{' '}
                    <strong className="text-foreground">Adicionar à tela inicial</strong>
                  </span>
                </li>
              </ol>
            </Panel>
          </div>
        </>
      )}

      <PushCard />

      {onboarding && (
        <Button
          size="lg"
          className="min-h-14 rounded-2xl text-[17px]"
          onClick={() => navigate('/')}
        >
          Ir para o início
        </Button>
      )}
    </>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="bg-secondary text-foreground flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs">
      {n}
    </span>
  )
}
