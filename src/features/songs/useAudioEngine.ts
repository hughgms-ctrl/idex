import { useCallback, useEffect, useRef, useState } from 'react'

import { clampRate } from '@/features/songs/audio-math'

type ToneModule = typeof import('tone')

// Tone.js só é baixado quando alguém abre a página de áudios.
let tonePromise: Promise<ToneModule> | null = null
const loadTone = () => (tonePromise ??= import('tone'))

type Engine = {
  Tone: ToneModule
  shift: InstanceType<ToneModule['PitchShift']>
  click: InstanceType<ToneModule['Synth']>
  clickId: number | null
  // O <audio> do aparelho toca o arquivo: ele muda o andamento sem mudar o tom
  // (preservesPitch, esticador de tempo nativo do navegador, bem mais limpo que
  // mudar a velocidade e corrigir o tom depois). O som passa pelo PitchShift
  // só para mudar o tom.
  media: { audio: HTMLAudioElement; source: MediaElementAudioSourceNode } | null
}

function releaseMedia(e: Engine) {
  if (!e.media) return
  e.media.audio.pause()
  e.media.audio.removeAttribute('src')
  e.media.audio.load()
  e.media.source.disconnect()
  e.media = null
}

/** Abre o arquivo pelo <audio> (precisa de CORS no armazenamento). */
async function openMedia(e: Engine, url: string): Promise<number> {
  const audio = new Audio()
  audio.crossOrigin = 'anonymous'
  audio.preload = 'auto'
  audio.preservesPitch = true
  ;(audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true
  const ready = new Promise<void>((resolve, reject) => {
    audio.addEventListener('loadedmetadata', () => resolve(), { once: true })
    audio.addEventListener('error', () => reject(new Error('media')), { once: true })
  })
  audio.src = url
  await ready
  const source = e.Tone.getContext().createMediaElementSource(audio)
  e.Tone.connect(source, e.shift)
  e.media = { audio, source }
  return Number.isFinite(audio.duration) ? audio.duration : 0
}

/** Diz por que o <audio> não abriu o arquivo. */
async function mediaError(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store', headers: { Range: 'bytes=0-0' } })
  } catch {
    return 'Não foi possível baixar o áudio (internet ou armazenamento).'
  }
  if (!res.ok) return `O link do áudio venceu ou o arquivo não foi achado (erro ${res.status}).`
  return 'Este aparelho não abre este formato no player. Prefira MP3.'
}

/**
 * Player de áudio de referência: muda o tom (meio em meio tom) sem mudar o
 * andamento, muda o andamento sem mudar o tom, e toca um metrônomo junto.
 */
export function useAudioEngine() {
  const engine = useRef<Engine | null>(null)
  const offset = useRef(0)
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
    const shift = new Tone.PitchShift({ pitch: 0, windowSize: 0.1, wet: 0 }).toDestination()
    const click = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
      volume: -8,
    }).toDestination()
    engine.current = { Tone, shift, click, clickId: null, media: null }
    return engine.current
  }, [])

  const applyPitch = useCallback(() => {
    const e = engine.current
    if (!e) return
    if (e.media) e.media.audio.playbackRate = settings.current.rate
    e.shift.pitch = settings.current.semitones
    // no tom original o som passa direto, sem o efeito
    e.shift.wet.value = settings.current.semitones === 0 ? 0 : 1
  }, [])

  const currentPosition = useCallback(() => {
    const e = engine.current
    if (e?.media && playingRef.current) return e.media.audio.currentTime
    return offset.current
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
    offset.current = currentPosition()
    playingRef.current = false
    if (e.media) {
      e.media.audio.onended = null
      e.media.audio.pause()
    }
    setPlaying(false)
    setPosition(offset.current)
    if (settings.current.metronome) stopMetronome()
  }, [currentPosition, stopMetronome])

  const play = useCallback(async () => {
    const e = await ensure()
    if (!e.media) {
      // só o metrônomo
      if (settings.current.metronome) startMetronome()
      return
    }
    const { audio } = e.media
    if (offset.current >= audio.duration - 0.05) offset.current = 0
    applyPitch()
    audio.currentTime = offset.current
    audio.onended = () => {
      if (!playingRef.current) return
      playingRef.current = false
      offset.current = 0
      setPlaying(false)
      setPosition(0)
      if (settings.current.metronome) stopMetronome()
    }
    await audio.play()
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
        releaseMedia(e)
        let length: number
        try {
          length = await openMedia(e, nextUrl)
        } catch {
          throw new Error(await mediaError(nextUrl))
        }
        offset.current = 0
        setDuration(length)
        setPosition(0)
        setUrl(nextUrl)
      } catch (err) {
        setUrl(null)
        setError(err instanceof Error ? err.message : 'Não foi possível carregar este áudio.')
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
      offset.current = Math.max(0, Math.min(seconds, duration))
      setPosition(offset.current)
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
      settings.current.rate = v
      setRateState(v)
      applyPitch()
      if (engine.current && settings.current.bpm) {
        engine.current.Tone.getTransport().bpm.value = settings.current.bpm * v
      }
    },
    [applyPitch],
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
      releaseMedia(e)
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
