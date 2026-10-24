import { useCallback, useEffect, useRef, useState } from 'react'

import { clampRate, pitchShiftFor, positionAt } from '@/features/songs/audio-math'

type ToneModule = typeof import('tone')

// Tone.js só é baixado quando alguém abre a página de áudios.
let tonePromise: Promise<ToneModule> | null = null
const loadTone = () => (tonePromise ??= import('tone'))

type Engine = {
  Tone: ToneModule
  player: InstanceType<ToneModule['Player']>
  shift: InstanceType<ToneModule['PitchShift']>
  click: InstanceType<ToneModule['Synth']>
  clickId: number | null
}

/**
 * Player de áudio de referência: muda o tom (meio em meio tom) sem mudar o
 * andamento, muda o andamento sem mudar o tom, e toca um metrônomo junto.
 */
export function useAudioEngine() {
  const engine = useRef<Engine | null>(null)
  const clock = useRef({ offset: 0, startedAt: 0 })
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [semitones, setSemitonesState] = useState(0)
  const [rate, setRateState] = useState(1)
  const [metronome, setMetronomeState] = useState(false)
  const settings = useRef({ semitones: 0, rate: 1, bpm: 0, beats: 4, metronome: false })
  const playingRef = useRef(false)

  const ensure = useCallback(async (): Promise<Engine> => {
    if (engine.current) return engine.current
    const Tone = await loadTone()
    await Tone.start()
    const shift = new Tone.PitchShift({ pitch: 0, windowSize: 0.08 }).toDestination()
    const player = new Tone.Player().connect(shift)
    const click = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
      volume: -8,
    }).toDestination()
    engine.current = { Tone, player, shift, click, clickId: null }
    return engine.current
  }, [])

  const applyPitch = useCallback(() => {
    const e = engine.current
    if (!e) return
    e.player.playbackRate = settings.current.rate
    e.shift.pitch = pitchShiftFor(settings.current.semitones, settings.current.rate)
  }, [])

  const currentPosition = useCallback(() => {
    const e = engine.current
    if (!e) return 0
    return playingRef.current
      ? positionAt({
          offset: clock.current.offset,
          startedAt: clock.current.startedAt,
          now: e.Tone.now(),
          rate: settings.current.rate,
          duration: e.player.buffer.duration,
        })
      : clock.current.offset
  }, [])
  // metrônomo pelo Transport do Tone (acento no 1º tempo do compasso)
  const startMetronome = useCallback(() => {
    const e = engine.current
    if (!e || !settings.current.bpm) return
    const transport = e.Tone.getTransport()
    transport.cancel()
    transport.bpm.value = settings.current.bpm * settings.current.rate
    let beat = 0
    e.clickId = transport.scheduleRepeat((time) => {
      e.click.triggerAttackRelease(beat % settings.current.beats === 0 ? 'C6' : 'G5', '32n', time)
      beat++
    }, '4n')
    transport.start()
  }, [])
  const stopMetronome = useCallback(() => {
    const e = engine.current
    if (!e) return
    const transport = e.Tone.getTransport()
    transport.stop()
    transport.cancel()
    e.clickId = null
  }, [])

  const pause = useCallback(() => {
    const e = engine.current
    if (!e || !playingRef.current) return
    clock.current.offset = currentPosition()
    playingRef.current = false
    e.player.onstop = () => undefined
    e.player.stop()
    setPlaying(false)
    setPosition(clock.current.offset)
    if (settings.current.metronome) stopMetronome()
  }, [currentPosition, stopMetronome])

  const play = useCallback(async () => {
    const e = await ensure()
    if (!e.player.loaded) {
      // só o metrônomo
      if (settings.current.metronome) startMetronome()
      return
    }
    if (clock.current.offset >= e.player.buffer.duration - 0.05) clock.current.offset = 0
    applyPitch()
    clock.current.startedAt = e.Tone.now()
    e.player.onstop = () => {
      if (!playingRef.current) return
      playingRef.current = false
      clock.current.offset = 0
      setPlaying(false)
      setPosition(0)
      if (settings.current.metronome) stopMetronome()
    }
    e.player.start(undefined, clock.current.offset)
    playingRef.current = true
    setPlaying(true)
    if (settings.current.metronome) startMetronome()
  }, [ensure, startMetronome, stopMetronome, applyPitch])

  const load = useCallback(
    async (nextUrl: string) => {
      pause()
      setLoading(true)
      setError(null)
      try {
        const e = await ensure()
        await e.player.load(nextUrl)
        clock.current = { offset: 0, startedAt: 0 }
        setDuration(e.player.buffer.duration)
        setPosition(0)
        setUrl(nextUrl)
      } catch {
        setError('Não foi possível carregar este áudio.')
      } finally {
        setLoading(false)
      }
    },
    [ensure, pause],
  )

  const seek = useCallback(
    (seconds: number) => {
      const wasPlaying = playingRef.current
      if (wasPlaying) pause()
      clock.current.offset = Math.max(0, Math.min(seconds, duration))
      setPosition(clock.current.offset)
      if (wasPlaying) void play()
    },
    [duration, pause, play],
  )

  const setSemitones = useCallback(
    (value: number) => {
      const v = Math.max(-12, Math.min(12, value))
      settings.current.semitones = v
      setSemitonesState(v)
      applyPitch()
    },
    [applyPitch],
  )

  const setRate = useCallback(
    (value: number) => {
      const v = clampRate(value)
      // mantém a posição certa ao trocar a velocidade no meio
      if (playingRef.current && engine.current) {
        clock.current.offset = currentPosition()
        clock.current.startedAt = engine.current.Tone.now()
      }
      settings.current.rate = v
      setRateState(v)
      applyPitch()
      if (engine.current && settings.current.bpm) {
        engine.current.Tone.getTransport().bpm.value = settings.current.bpm * v
      }
    },
    [currentPosition, applyPitch],
  )

  /** BPM e compasso da música (o metrônomo acompanha a velocidade). */
  const setTempo = useCallback((bpm: number, beats: number) => {
    settings.current.bpm = bpm
    settings.current.beats = beats
    if (engine.current && bpm) {
      engine.current.Tone.getTransport().bpm.value = bpm * settings.current.rate
    }
  }, [])

  const setMetronome = useCallback(
    async (on: boolean) => {
      settings.current.metronome = on
      setMetronomeState(on)
      await ensure()
      if (on) startMetronome()
      else stopMetronome()
    },
    [ensure, startMetronome, stopMetronome],
  )

  // relógio da barra de progresso
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setPosition(currentPosition()), 250)
    return () => window.clearInterval(id)
  }, [playing, currentPosition])

  // libera o áudio ao sair da página
  useEffect(
    () => () => {
      const e = engine.current
      if (!e) return
      playingRef.current = false
      e.Tone.getTransport().stop()
      e.Tone.getTransport().cancel()
      e.player.dispose()
      e.shift.dispose()
      e.click.dispose()
      engine.current = null
    },
    [],
  )

  return {
    url,
    loading,
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
