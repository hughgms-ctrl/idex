import { useCallback, useEffect, useRef, useState } from 'react'

import type { MultitrackPlayer, TrackSource } from '@/features/multitracks/multitrack-engine'
import { clampRate } from '@/features/songs/audio-math'

// O motor (e o Signalsmith) só é baixado quando o Multitracks é usado.
let enginePromise: Promise<typeof import('@/features/multitracks/multitrack-engine')> | null = null
const loadEngine = () => (enginePromise ??= import('@/features/multitracks/multitrack-engine'))

// Ao sair da tela (ex.: ir ao mixer e voltar), as faixas abertas ficam na
// memória por alguns minutos: voltar não abre tudo de novo. Um motor só.
const KEEP_MS = 20 * 60 * 1000
let kept: { engine: MultitrackPlayer; key: string; timer: number } | null = null

function keep(engine: MultitrackPlayer, key: string | null) {
  release()
  if (!key) return engine.dispose()
  engine.pause()
  engine.setMetronome(false, 0, 4)
  kept = { engine, key, timer: window.setTimeout(release, KEEP_MS) }
}

function release() {
  if (!kept) return
  window.clearTimeout(kept.timer)
  kept.engine.dispose()
  kept = null
}

function adopt(): { engine: MultitrackPlayer; key: string } | null {
  if (!kept) return null
  window.clearTimeout(kept.timer)
  const k = kept
  kept = null
  return k
}

/** Várias faixas juntas: um tom, um andamento, um metrônomo; volume por faixa. */
export function useMultitrack() {
  // motor que ficou aberto da visita anterior a esta tela
  const [adopted] = useState(adopt)
  const engine = useRef<MultitrackPlayer | null>(adopted?.engine ?? null)
  const [loadedKey, setLoadedKey] = useState<string | null>(adopted?.key ?? null)
  const [progress, setProgress] = useState<{
    done: number
    total: number
    toDownload: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(adopted?.engine.duration ?? 0)
  const [position, setPosition] = useState(() => adopted?.engine.position() ?? 0)
  const [semitones, setSemitonesState] = useState(adopted?.engine.semitones ?? 0)
  const [rate, setRateState] = useState(adopted?.engine.rate ?? 1)
  const [metronome, setMetronomeState] = useState(false)
  const tempo = useRef({ bpm: 0, beats: 4 })
  const settings = useRef({ semitones, rate })
  useEffect(() => {
    settings.current = { semitones, rate }
  }, [semitones, rate])

  useEffect(() => {
    void loadEngine()
  }, [])

  // avisos do motor para esta tela (não para a visita anterior)
  const [buffering, setBuffering] = useState(false)
  const wire = useCallback((e: MultitrackPlayer) => {
    e.onEnded = () => {
      setPlaying(false)
      setPosition(0)
    }
    e.onWaiting = setBuffering
    e.onDuration = setDuration
  }, [])

  const ensure = useCallback(async (): Promise<MultitrackPlayer> => {
    if (engine.current) return engine.current
    const { MultitrackPlayer } = await loadEngine()
    if (engine.current) return engine.current
    const e = new MultitrackPlayer()
    wire(e)
    e.setTempo(tempo.current.bpm, tempo.current.beats)
    e.setSettings(settings.current.semitones, settings.current.rate)
    engine.current = e
    return e
  }, [wire])

  const pause = useCallback(() => {
    const e = engine.current
    if (!e) return
    e.pause()
    setPlaying(false)
    setPosition(e.position())
  }, [])

  const play = useCallback(async () => {
    const e = await ensure()
    try {
      await e.play()
      setPlaying(e.playing)
    } catch {
      setError('Não foi possível tocar as faixas.')
    }
  }, [ensure])

  /**
   * Abre as faixas; `key` identifica o conjunto (ids das faixas). Mantém a
   * posição quando o conjunto muda no meio do estudo.
   */
  const load = useCallback(
    async (sources: TrackSource[], gains: Record<string, number>, key: string) => {
      setError(null)
      setProgress({ done: 0, total: sources.length, toDownload: 0 })
      try {
        const e = await ensure()
        const keep = e.position()
        const length = await e.load(sources, gains, (done, total, toDownload) =>
          setProgress({ done, total, toDownload }),
        )
        setDuration(length)
        if (keep > 0 && keep < length) await e.seek(keep)
        setPosition(e.position())
        setPlaying(false)
        setLoadedKey(key)
        return true
      } catch (err) {
        if (err instanceof Error && err.message === 'cancelado') return false
        setLoadedKey(null)
        setError(err instanceof Error ? err.message : 'Não foi possível abrir as faixas.')
        return false
      } finally {
        setProgress(null)
      }
    },
    [ensure],
  )

  const seek = useCallback(async (seconds: number) => {
    const e = engine.current
    if (!e) return
    setPosition(seconds)
    await e.seek(seconds)
  }, [])

  const setSemitones = useCallback((value: number) => {
    const v = Math.max(-12, Math.min(12, value))
    setSemitonesState(v)
    engine.current?.setSettings(v, engine.current.rate)
  }, [])

  const setRate = useCallback((value: number) => {
    const v = clampRate(value)
    setRateState(v)
    engine.current?.setSettings(engine.current.semitones, v)
  }, [])

  const setGains = useCallback((gains: Record<string, number>) => {
    engine.current?.setGains(gains)
  }, [])

  const setTempo = useCallback((bpm: number, beats: number) => {
    tempo.current = { bpm, beats }
    engine.current?.setTempo(bpm, beats)
  }, [])

  const setMetronome = useCallback(
    async (on: boolean) => {
      setMetronomeState(on)
      const e = await ensure()
      e.setMetronome(on, tempo.current.bpm, tempo.current.beats)
    },
    [ensure],
  )

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      const e = engine.current
      if (e) setPosition(e.tick())
    }, 250)
    return () => window.clearInterval(id)
  }, [playing])

  const loadedRef = useRef(loadedKey)
  useEffect(() => {
    loadedRef.current = loadedKey
  }, [loadedKey])

  useEffect(() => {
    // modo estrito do React desmonta e monta de novo: pega o motor de volta
    if (!engine.current) engine.current = adopt()?.engine ?? null
    // o fim da música avisa esta tela (não a visita anterior)
    if (engine.current) wire(engine.current)
    return () => {
      const e = engine.current
      engine.current = null
      if (e) keep(e, loadedRef.current)
    }
  }, [wire])

  return {
    loadedKey,
    loading: progress !== null,
    /** Tocando, mas parado esperando o resto das faixas abrir. */
    buffering,
    progress,
    error,
    playing,
    duration,
    position,
    semitones,
    rate,
    metronome,
    load,
    play,
    pause,
    seek,
    setSemitones,
    setRate,
    setGains,
    setTempo,
    setMetronome,
  }
}
