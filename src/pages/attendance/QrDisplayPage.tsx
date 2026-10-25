import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { Maximize, X } from 'lucide-react'
import { qrCheckinUrl } from '@domain/qr.ts'

import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { useEvent } from '@/features/schedule/queries'
import { invokeFunction } from '@/lib/functions'
import { formatEventDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type Token = { payload: string; refreshInMs: number }

// QR rotativo em tela cheia para o líder projetar no telão.
export function QrDisplayPage() {
  const { eventId = '' } = useParams()
  const event = useEvent(eventId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  const token = useQuery({
    queryKey: ['qr-token', eventId],
    queryFn: () => invokeFunction<Token>('qr-token', { eventId }),
    refetchInterval: (q) =>
      Math.min((q.state.data as Token | undefined)?.refreshInMs ?? 10_000, 10_000),
    refetchIntervalInBackground: true,
    gcTime: 0,
    retry: 2,
  })

  const count = useQuery({
    queryKey: ['qr-count', eventId],
    refetchInterval: 5_000,
    queryFn: async () => {
      const { count: n, error: err } = await supabase
        .from('checkins')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
      if (err) throw err
      return n ?? 0
    },
  })

  useEffect(() => {
    if (!token.data || !canvasRef.current) return
    // endereço do app: a câmera comum do celular também abre o check-in
    QRCode.toCanvas(canvasRef.current, qrCheckinUrl(window.location.origin, token.data.payload), {
      width: 560,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0e0f12', light: '#ffffff' },
    })
      .then(() => {
        // a biblioteca fixa o tamanho em pixels; deixamos o CSS decidir
        canvasRef.current?.style.removeProperty('width')
        canvasRef.current?.style.removeProperty('height')
      })
      .catch(() => setError('Não foi possível desenhar o QR.'))
  }, [token.data])

  // mantém a tela acesa enquanto o QR está aberto
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    let lock: { release: () => Promise<void> } | null = null
    nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => undefined)
    return () => void lock?.release().catch(() => undefined)
  }, [])

  const message = error ?? (token.error instanceof Error ? token.error.message : null)

  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-between gap-6 p-6">
      <header className="flex w-full items-center justify-between">
        <Logo />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Tela cheia"
            onClick={() =>
              void document.documentElement.requestFullscreen?.().catch(() => undefined)
            }
          >
            <Maximize />
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Fechar">
            <Link to="/presenca">
              <X />
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-col items-center gap-4 text-center">
        <span className="text-primary text-xs font-semibold tracking-wider">CHECK-IN</span>
        <h1 className="font-display text-3xl font-bold">{event.data?.title ?? 'Evento'}</h1>
        {event.data && (
          <p className="text-muted-foreground">{formatEventDate(event.data.starts_at)}</p>
        )}
      </div>

      <div className="rounded-3xl bg-white p-4">
        {message ? (
          <p className="max-w-xs p-8 text-center text-sm text-black">{message}</p>
        ) : (
          <canvas
            ref={canvasRef}
            aria-label="QR do check-in"
            className="size-[min(78vw,52vh)] max-h-[560px] max-w-[560px]"
          />
        )}
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-lg">
          Aponte a câmera do celular ou toque em <strong>Registrar presença</strong> no ide.x
        </p>
        <p className="text-muted-foreground text-sm">
          O código muda a cada 30 segundos ·{' '}
          <span className="text-primary font-mono">{count.data ?? 0}</span> presenças registradas
        </p>
      </div>
    </div>
  )
}
