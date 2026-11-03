import { useCallback, useEffect, useRef, useState } from 'react'

import type { MultitrackPlayer, TrackSource } from '@/features/multitracks/multitrack-engine'
import { clampRate } from '@/features/songs/audio-math'

// O motor (e o Signalsmith) só é baixado quando o Multitracks é usado.
let enginePromise: Promise<typeof import('@/features/multitracks/multitrack-engine')> | null = null
const loadEngine = () => (enginePromise ??= import('@/features/multitracks/multitrack-engine'))

/** Várias faixas juntas: um tom, um andamento, um metrônomo; volume por faixa. */
export function useMultitrack() {
  const engine = useRef<MultitrackPlayer | null>(null)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [semitones, setSemitonesState] = useState(0)
  const [rate, setRateState] = useState(1)
  const [metronome, setMetronomeState] = useState(false)
  const tempo = useRef({ bpm: 0, beats: 4 })
  const settings = useRef({ semitones, rate })
  useEffect(() => {
    settings.current = { semitones, rate }
  }, [semitones, rate])

  useEffect(() => {
    void loadEngine()
  }, [])

  const ensure = useCallback(async (): Promise<MultitrackPlayer> => {
    if (engine.current) return engine.current
    const { MultitrackPlayer } = await loadEngine()
    if (engine.current) return engine.current
    const e = new MultitrackPlayer()
    e.onEnded = () => {
      setPlaying(false)
      setPosition(0)
    }
    e.setTempo(tempo.current.bpm, tempo.current.beats)
    e.setSettings(settings.current.semitones, settings.current.rate)
    engine.current = e
    return e
  }, [])

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
      setProgress({ done: 0, total: sources.length })
      try {
        const e = await ensure()
        const keep = e.position()
        const length = await e.load(sources, gains, (done, total) => setProgress({ done, total }))
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

  useEffect(
    () => () => {
      engine.current?.dispose()
      engine.current = null
    },
    [],
  )

  return {
    loadedKey,
    loading: progress !== null,
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
