import { useCallback, useEffect, useRef, useState } from 'react'

import type { ReferencePlayer } from '@/features/songs/audio-engine'
import { clampRate } from '@/features/songs/audio-math'

// O motor (e o Signalsmith Stretch) só é baixado quando alguém toca um áudio.
let enginePromise: Promise<typeof import('@/features/songs/audio-engine')> | null = null
const loadEngine = () => (enginePromise ??= import('@/features/songs/audio-engine'))

/**
 * Player de áudio de referência: muda o tom (meio em meio tom) sem mudar o
 * andamento, muda o andamento sem mudar o tom, e toca um metrônomo junto.
 */
export function useAudioEngine() {
  const engine = useRef<ReferencePlayer | null>(null)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [semitones, setSemitonesState] = useState(0)
  const [rate, setRateState] = useState(1)
  const [metronome, setMetronomeState] = useState(false)
  const tempo = useRef({ bpm: 0, beats: 4 })
  // valores da tela: o motor nasce com eles (quem muda tom/andamento antes de tocar)
  const settings = useRef({ semitones, rate })
  useEffect(() => {
    settings.current = { semitones, rate }
  }, [semitones, rate])

  // O AudioContext precisa nascer no toque da pessoa (iPhone): o módulo é
  // pré-carregado assim que a tela abre, para estar pronto na hora.
  useEffect(() => {
    void loadEngine()
  }, [])

  const ensure = useCallback(async (): Promise<ReferencePlayer> => {
    if (engine.current) return engine.current
    const { ReferencePlayer } = await loadEngine()
    if (engine.current) return engine.current
    const e = new ReferencePlayer()
    e.onPreparing = setPreparing
    e.onEnded = () => {
      setPlaying(false)
      setPosition(0)
    }
    e.setTempo(tempo.current.bpm, tempo.current.beats)
    void e.setSettings(settings.current.semitones, settings.current.rate)
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
      setError('Não foi possível tocar este áudio.')
    }
  }, [ensure])

  /** Abre o arquivo; `key` identifica o arquivo (o link assinado muda). */
  const load = useCallback(
    async (url: string, key: string): Promise<boolean> => {
      setLoading(true)
      setError(null)
      setPlaying(false)
      try {
        const e = await ensure()
        const length = await e.load(url)
        setDuration(length)
        setPosition(0)
        setLoadedKey(key)
        return true
      } catch (err) {
        if (err instanceof Error && err.message === 'cancelado') return false
        setLoadedKey(null)
        setError(err instanceof Error ? err.message : 'Não foi possível carregar este áudio.')
        return false
      } finally {
        setLoading(false)
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
    const e = engine.current
    if (e) void e.setSettings(v, e.rate)
  }, [])

  const setRate = useCallback((value: number) => {
    const v = clampRate(value)
    setRateState(v)
    const e = engine.current
    if (e) void e.setSettings(e.semitones, v)
  }, [])

  /** BPM e compasso da música (o metrônomo acompanha a velocidade). */
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

  // relógio da barra de progresso (e fim da música)
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      const e = engine.current
      if (e) setPosition(e.tick())
    }, 250)
    return () => window.clearInterval(id)
  }, [playing])

  // libera o áudio ao sair da página
  useEffect(
    () => () => {
      engine.current?.dispose()
      engine.current = null
    },
    [],
  )

  return {
    loadedKey,
    loading,
    preparing,
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
    setTempo,
    setMetronome,
  }
}
