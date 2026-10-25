import { useCallback, useEffect, useRef, useState } from 'react'

import { beatSeconds, clampRate } from '@/features/songs/audio-math'

type StretchModule = typeof import('signalsmith-stretch')
type StretchNode = Awaited<ReturnType<StretchModule['default']>>

// Signalsmith Stretch (MIT, WASM em AudioWorklet) só é baixado quando alguém
// muda o tom na página de áudios.
let stretchPromise: Promise<StretchModule> | null = null
const loadStretch = () => (stretchPromise ??= import('signalsmith-stretch'))

type Engine = {
  ctx: AudioContext
  // O <audio> do aparelho toca o arquivo: ele muda o andamento sem mudar o tom
  // (preservesPitch, esticador de tempo nativo do navegador). O tom muda no
  // Signalsmith Stretch: o <audio> fica ligado nos dois caminhos e o som sai
  // pelo `dry` (tom original, sem processar) ou pelo `wet` (tom mudado); trocar
  // o volume dos dois em vez de religar evita estalo.
  dry: GainNode
  pitch: { stretch: StretchNode; wet: GainNode } | null
  media: { audio: HTMLAudioElement; source: MediaElementAudioSourceNode } | null
  metronome: { timer: number; next: number; beat: number } | null
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
  const source = e.ctx.createMediaElementSource(audio)
  source.connect(e.dry)
  if (e.pitch) source.connect(e.pitch.stretch)
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

/** Clique do metrônomo (onda quadrada curta; agudo no 1º tempo). */
function click(ctx: AudioContext, time: number, accent: boolean) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = accent ? 1046.5 : 784
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.exponentialRampToValueAtTime(0.35, time + 0.001)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06)
  osc.connect(gain).connect(ctx.destination)
  osc.start(time)
  osc.stop(time + 0.07)
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
    if (!engine.current) {
      const ctx = new AudioContext()
      const dry = ctx.createGain()
      dry.connect(ctx.destination)
      engine.current = { ctx, dry, pitch: null, media: null, metronome: null }
    }
    if (engine.current.ctx.state !== 'running') await engine.current.ctx.resume()
    return engine.current
  }, [])

  /** Tom original: som direto. Tom mudado: som pelo Stretch (carregado na 1ª vez). */
  const route = useCallback(async () => {
    const e = engine.current
    if (!e) return
    const semis = settings.current.semitones
    if (semis !== 0 && !e.pitch) {
      try {
        const { default: SignalsmithStretch } = await loadStretch()
        const stretch = await SignalsmithStretch(e.ctx)
        const wet = e.ctx.createGain()
        wet.gain.value = 0
        stretch.connect(wet).connect(e.ctx.destination)
        await stretch.start()
        e.media?.source.connect(stretch)
        e.pitch = { stretch, wet }
      } catch {
        setError('Este aparelho não consegue mudar o tom. Atualize o navegador.')
        return
      }
    }
    if (settings.current.semitones !== semis) return // mudou enquanto carregava
    const shifted = semis !== 0 && e.pitch !== null
    if (e.pitch) void e.pitch.stretch.schedule({ semitones: semis })
    // troca suave (30 ms) para não estalar
    const t = e.ctx.currentTime
    e.dry.gain.setTargetAtTime(shifted ? 0 : 1, t, 0.01)
    e.pitch?.wet.gain.setTargetAtTime(shifted ? 1 : 0, t, 0.01)
  }, [])

  const currentPosition = useCallback(() => {
    const e = engine.current
    if (e?.media && playingRef.current) return e.media.audio.currentTime
    return offset.current
  }, [])

  // metrônomo: agenda os cliques um pouco à frente no relógio do Web Audio
  const startMetronome = useCallback(() => {
    const e = engine.current
    if (!e || !settings.current.bpm) return
    if (e.metronome) window.clearInterval(e.metronome.timer)
    const m = { timer: 0, next: e.ctx.currentTime + 0.05, beat: 0 }
    const tick = () => {
      const s = settings.current
      while (m.next < e.ctx.currentTime + 0.15) {
        click(e.ctx, m.next, m.beat % s.beats === 0)
        m.beat++
        m.next += beatSeconds(s.bpm, s.rate)
      }
    }
    tick()
    m.timer = window.setInterval(tick, 25)
    e.metronome = m
  }, [])
  const stopMetronome = useCallback(() => {
    const e = engine.current
    if (!e?.metronome) return
    window.clearInterval(e.metronome.timer)
    e.metronome = null
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
    audio.playbackRate = settings.current.rate
    await route()
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
  }, [ensure, route, startMetronome, stopMetronome])

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
        await route()
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
    [ensure, pause, route],
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
      void route()
    },
    [route],
  )

  const setRate = useCallback((value: number) => {
    const v = clampRate(value)
    settings.current.rate = v
    setRateState(v)
    if (engine.current?.media) engine.current.media.audio.playbackRate = v
  }, [])

  /** BPM e compasso da música (o metrônomo acompanha a velocidade). */
  const setTempo = useCallback((bpm: number, beats: number) => {
    settings.current.bpm = bpm
    settings.current.beats = beats
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
      if (e.metronome) window.clearInterval(e.metronome.timer)
      releaseMedia(e)
      e.pitch?.stretch.disconnect()
      void e.ctx.close()
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
