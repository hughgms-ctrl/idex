import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import QrScanner from 'qr-scanner'
import { CheckCircle2, ChevronLeft, Clock, MapPin, QrCode, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { attendanceKeys } from '@/features/attendance/queries'
import { invokeFunction } from '@/lib/functions'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type Position = { lat: number; lng: number; accuracy: number }
type Result = {
  arrivedAt: string
  kind: 'on_time' | 'late' | 'justified' | 'absent'
  lateMinutes: number
  delta: number
  balance: number | null
  distanceM: number
}
type Step =
  | { name: 'intro' }
  | { name: 'scanning' }
  | { name: 'sending' }
  | { name: 'done'; result: Result }
  | { name: 'error'; message: string }

function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este aparelho não informa a localização.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: Math.round(p.coords.accuracy),
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Sem permissão de localização. Libere a localização para o app nas configurações do navegador.'
              : 'Não foi possível pegar sua localização. Vá para um lugar aberto e tente de novo.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    )
  })
}

export function CheckinPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const positionRef = useRef<Promise<Position> | null>(null)
  const [step, setStep] = useState<Step>({ name: 'intro' })
  const [position, setPosition] = useState<Position | null>(null)

  const stop = useCallback(() => {
    scannerRef.current?.stop()
    scannerRef.current?.destroy()
    scannerRef.current = null
  }, [])
  useEffect(() => stop, [stop])

  const send = useCallback(
    async (qr: string) => {
      stop()
      setStep({ name: 'sending' })
      try {
        const pos = await (positionRef.current ?? getPosition())
        const result = await invokeFunction<Result>('checkin', {
          qr,
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
        })
        await queryClient.invalidateQueries({ queryKey: attendanceKeys.all })
        await queryClient.invalidateQueries({ queryKey: ['my-balance'] })
        setStep({ name: 'done', result })
        navigator.vibrate?.(80)
      } catch (err) {
        setStep({ name: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    },
    [queryClient, stop],
  )

  const start = async () => {
    setStep({ name: 'scanning' })
    // localização em paralelo com a câmera
    positionRef.current = getPosition()
    positionRef.current.then(setPosition).catch((err: Error) => {
      stop()
      setStep({ name: 'error', message: err.message })
    })
    try {
      if (!videoRef.current) return
      const scanner = new QrScanner(videoRef.current, (r) => void send(r.data), {
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 8,
      })
      scannerRef.current = scanner
      await scanner.start()
    } catch {
      stop()
      setStep({
        name: 'error',
        message:
          'Não foi possível abrir a câmera. Libere a câmera para o app nas configurações do navegador.',
      })
    }
  }

  return (
    <div className="-mx-5 -mt-5 flex min-h-[calc(100dvh-7rem)] flex-col md:-mx-8 md:-mt-8">
      <header className="flex items-center gap-2 px-3 pt-4 pb-2">
        <Button variant="ghost" size="icon" aria-label="Voltar" onClick={() => navigate(-1)}>
          <ChevronLeft className="size-[22px]" />
        </Button>
        <h1 className="text-[17px] font-semibold">Bater ponto</h1>
      </header>

      <div className="flex flex-1 flex-col gap-5 px-5 pb-6">
        {step.name === 'intro' && (
          <>
            <div className="bg-card flex flex-col gap-4 rounded-[20px] border p-5">
              <QrCode className="text-primary size-10" aria-hidden="true" />
              <p className="font-display text-[22px] leading-tight font-medium">
                Aponte a câmera para o QR que o líder está mostrando.
              </p>
              <ul className="text-muted-foreground flex flex-col gap-3 text-sm">
                <li className="flex gap-3">
                  <QrCode className="mt-0.5 size-4 shrink-0" aria-hidden="true" />A câmera só é
                  usada para ler o QR; nada é gravado.
                </li>
                <li className="flex gap-3">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />A localização
                  confirma que você está na igreja. Ela só é lida agora, no check-in.
                </li>
              </ul>
            </div>
            <Button
              size="lg"
              className="min-h-14 rounded-2xl text-[17px]"
              onClick={() => void start()}
            >
              Permitir câmera e localização
            </Button>
          </>
        )}

        <div
          className={cn(
            'relative overflow-hidden rounded-[20px] bg-black',
            step.name !== 'scanning' && 'hidden',
          )}
        >
          <video ref={videoRef} className="aspect-[3/4] w-full object-cover" muted playsInline />
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-xl bg-black/70 px-3 py-2 text-xs text-white">
            <MapPin className="size-4" aria-hidden="true" />
            {position ? `Localização ok (±${position.accuracy} m)` : 'Pegando sua localização…'}
          </div>
        </div>

        {step.name === 'sending' && (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3">
            <Clock className="size-8 animate-pulse" aria-hidden="true" />
            Registrando sua presença…
          </div>
        )}

        {step.name === 'done' && <CheckinResult result={step.result} />}

        {step.name === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="border-warning flex gap-3 rounded-2xl border p-4">
              <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p className="text-sm leading-relaxed">{step.message}</p>
            </div>
            <Button size="lg" onClick={() => void start()}>
              Tentar de novo
            </Button>
            <Button asChild variant="ghost">
              <Link to="/presenca">Esqueci de registrar / outras opções</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckinResult({ result }: { result: Result }) {
  const late = result.kind === 'late'
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-card flex flex-col items-center gap-3 rounded-[20px] border p-6 text-center">
        <CheckCircle2
          className={cn('size-14', late ? 'text-warning' : 'text-primary')}
          aria-hidden="true"
        />
        <p className="font-display text-2xl font-bold">Presença registrada</p>
        <p className="font-mono text-lg">{formatDateTime(result.arrivedAt)}</p>
        <span
          className={cn(
            'text-primary-foreground rounded-md px-2.5 py-1 text-xs font-semibold',
            late ? 'bg-warning' : result.kind === 'justified' ? 'bg-info' : 'bg-primary',
          )}
        >
          {late
            ? `ATRASO DE ${result.lateMinutes} MIN · ${result.delta} PONTOS`
            : result.kind === 'justified'
              ? 'ATRASO JUSTIFICADO · SEM DESCONTO'
              : 'NO HORÁRIO'}
        </span>
        {result.balance !== null && (
          <p className="text-muted-foreground text-sm">
            Seu saldo no ciclo:{' '}
            <strong className="text-foreground font-mono">{result.balance}</strong> pontos
          </p>
        )}
      </div>
      <Button asChild size="lg" variant="outline">
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  )
}
