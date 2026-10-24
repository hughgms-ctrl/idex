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
  // Quando o Web Audio não decodifica o arquivo (alguns m4a), o próprio
  // <audio> do aparelho decodifica e o som passa pelo mesmo PitchShift.
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

/** Abre o arquivo pelo <audio> (precisa de CORS no armazenamento, que o R2 já libera). */
async function openMedia(e: Engine, url: string): Promise<number> {
  const audio = new Audio()
  audio.crossOrigin = 'anonymous'
  audio.preload = 'auto'
  audio.preservesPitch = false // o tom é corrigido pelo PitchShift, igual ao outro modo
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
    engine.current = { Tone, player, shift, click, clickId: null, media: null }
    return engine.current
  }, [])

  const applyPitch = useCallback(() => {
    const e = engine.current
    if (!e) return
    e.player.playbackRate = settings.current.rate
    if (e.media) e.media.audio.playbackRate = settings.current.rate
    e.shift.pitch = pitchShiftFor(settings.current.semitones, settings.current.rate)
  }, [])

  const currentPosition = useCallback(() => {
    const e = engine.current
    if (!e) return 0
    if (e.media) return e.media.audio.currentTime
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
    if (e.media) {
      e.media.audio.onended = null
      e.media.audio.pause()
    } else {
      e.player.onstop = () => undefined
      e.player.stop()
    }
    setPlaying(false)
    setPosition(clock.current.offset)
    if (settings.current.metronome) stopMetronome()
  }, [currentPosition, stopMetronome])

  const play = useCallback(async () => {
    const e = await ensure()
    const ended = () => {
      if (!playingRef.current) return
      playingRef.current = false
      clock.current.offset = 0
      setPlaying(false)
      setPosition(0)
      if (settings.current.metronome) stopMetronome()
    }
    if (e.media) {
      const { audio } = e.media
      if (clock.current.offset >= audio.duration - 0.05) clock.current.offset = 0
      applyPitch()
      audio.currentTime = clock.current.offset
      audio.onended = ended
      await audio.play()
      playingRef.current = true
      setPlaying(true)
      if (settings.current.metronome) startMetronome()
      return
    }
    if (!e.player.loaded) {
      // só o metrônomo
      if (settings.current.metronome) startMetronome()
      return
    }
    if (clock.current.offset >= e.player.buffer.duration - 0.05) clock.current.offset = 0
    applyPitch()
    clock.current.startedAt = e.Tone.now()
    e.player.onstop = ended
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
        releaseMedia(e)
        // Baixa e decodifica aqui (e não pelo player.load) para dizer o motivo
        // da falha. `no-store`: uma resposta guardada sem CORS quebraria o fetch.
        let res: Response
        try {
          res = await fetch(nextUrl, { cache: 'no-store' })
        } catch {
          throw new Error('Não foi possível baixar o áudio (internet ou armazenamento).')
        }
        if (!res.ok) {
          throw new Error(
            `O link do áudio venceu ou o arquivo não foi achado (erro ${res.status}).`,
          )
        }
        const data = await res.arrayBuffer()
        let decoded: AudioBuffer | null = null
        try {
          decoded = await e.Tone.getContext().decodeAudioData(data)
        } catch {
          // segue pelo <audio> do aparelho
        }
        let length: number
        if (decoded) {
          e.player.buffer = new e.Tone.ToneAudioBuffer(decoded)
          length = e.player.buffer.duration
        } else {
          try {
            length = await openMedia(e, nextUrl)
          } catch {
            throw new Error('Este aparelho não abre este formato no player. Prefira MP3.')
          }
        }
        clock.current = { offset: 0, startedAt: 0 }
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
      releaseMedia(e)
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
