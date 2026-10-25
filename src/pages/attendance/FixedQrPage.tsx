import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Printer, RefreshCw, X } from 'lucide-react'
import { fixedQrUrl } from '@domain/qr.ts'

import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { useChurch } from '@/features/church/church-context'
import { ministryKeys, useMinistrySettings } from '@/features/ministries/queries'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

// QR fixo do ministério: imprima e cole na igreja. Leva cada integrante ao
// ponto do culto ou ensaio dele que estiver aberto naquele momento.
export function FixedQrPage() {
  const { church, ministry, isLeader } = useChurch()
  const settings = useMinistrySettings(ministry?.id)
  const queryClient = useQueryClient()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const code = settings.data?.checkin_code
  const leader = ministry ? isLeader(ministry.id) : false

  useEffect(() => {
    if (!code || !canvasRef.current) return
    void QRCode.toCanvas(canvasRef.current, fixedQrUrl(window.location.origin, code), {
      width: 720,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0e0f12', light: '#ffffff' },
    }).then(() => {
      canvasRef.current?.style.removeProperty('width')
      canvasRef.current?.style.removeProperty('height')
    })
  }, [code])

  const regenerate = useMutation({
    mutationFn: async () => {
      if (!ministry) return
      const { error } = await supabase.rpc('regenerate_checkin_code', {
        p_ministry_id: ministry.id,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ministryKeys.settings(ministry?.id ?? '') })
      toast.success('QR novo gerado. Imprima de novo: o antigo não vale mais.')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <div className="flex min-h-dvh flex-col items-center gap-6 bg-[#0e0f12] px-6 py-6 print:bg-white print:text-black">
      <header className="flex w-full max-w-3xl items-center justify-between print:hidden">
        <Logo />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Imprimir"
            onClick={() => window.print()}
          >
            <Printer />
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Fechar">
            <Link to="/presenca">
              <X />
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-primary text-xs font-semibold tracking-wider print:text-black">
          PONTO DO {ministry?.name.toUpperCase()}
        </span>
        <h1 className="font-display text-3xl font-bold">{church.name}</h1>
      </div>

      <div className="rounded-3xl bg-white p-4">
        {code ? (
          <canvas
            ref={canvasRef}
            aria-label="QR fixo da presença"
            className="size-[min(80vw,55vh)] max-h-[720px] max-w-[720px]"
          />
        ) : (
          <p className="p-8 text-sm text-black">Carregando…</p>
        )}
      </div>

      <div className="flex max-w-md flex-col items-center gap-1 text-center">
        <p className="text-lg">Aponte a câmera do celular para registrar sua presença</p>
        <p className="text-muted-foreground text-sm print:text-black">
          Vale para todos os cultos e ensaios: o app abre o registro de presença do evento de cada
          pessoa.
        </p>
      </div>

      {leader && (
        <div className="flex max-w-md flex-col items-center gap-2 text-center print:hidden">
          <p className="text-muted-foreground text-[13px]">
            O QR é sempre o mesmo. Para evitar presença registrada de longe (alguém fotografar o
            QR), deixe “QR Code + localização” em Configurações. Se o QR vazar, gere outro.
          </p>
          <Button
            variant="ghost"
            disabled={regenerate.isPending}
            onClick={() => {
              if (window.confirm('Gerar um QR novo? O impresso atual deixa de funcionar.')) {
                regenerate.mutate()
              }
            }}
          >
            <RefreshCw aria-hidden="true" /> Gerar QR novo
          </Button>
        </div>
      )}
    </div>
  )
}
