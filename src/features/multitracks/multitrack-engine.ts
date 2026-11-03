import type { StretchNode } from 'signalsmith-stretch'

import { Metronome } from '@/features/songs/audio-engine'
import { positionAt } from '@/features/songs/audio-math'
import { MAX_CHANNELS } from '@/features/multitracks/mix'

// Motor do Multitracks, sem React.
//
// Cada faixa tem o seu processador Signalsmith Stretch (um só para todas
// misturaria as faixas: ele analisa os canais juntos e o tom de uma faixa
// "puxa" o da outra). Todos recebem a mesma programação no relógio do áudio
// (mesmo instante, mesma posição, mesmo tom e andamento), então tocam
// amostra por amostra juntos. Cada faixa tem o seu volume (mudo/solo = 0).
//
// Memória: as faixas ficam abertas (descomprimidas) na memória. Faixa estéreo
// com os dois lados iguais vira mono (metade). Em celular a taxa é 32 kHz.

let stretchModule: Promise<typeof import('signalsmith-stretch').default> | null = null
const loadStretch = () => (stretchModule ??= import('signalsmith-stretch').then((m) => m.default))

const FADE = 0.03

export type TrackSource = { id: string; url: string; name: string }

type Track = { id: string; node: StretchNode; gain: GainNode }

function lowMemoryDevice(): boolean {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  return coarse || (mem !== undefined && mem <= 4)
}

/** Lados esquerdo e direito iguais (faixa mono gravada em estéreo). */
function sameSides(b: AudioBuffer): boolean {
  if (b.numberOfChannels < 2) return true
  const l = b.getChannelData(0)
  const r = b.getChannelData(1)
  for (let i = 0; i < l.length; i += 61) {
    if (Math.abs((l[i] ?? 0) - (r[i] ?? 0)) > 1e-4) return false
  }
  return true
}

export class MultitrackPlayer {
  readonly ctx: AudioContext
  private out: GainNode
  private fade: GainNode
  private tracks: Track[] = []
  private latency = 0
  private gen = 0
  private offset = 0
  private startedAt = 0
  private metronome: Metronome
  playing = false
  duration = 0
  semitones = 0
  rate = 1
  loadedIds: string[] = []
  onEnded: () => void = () => undefined

  constructor() {
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
    let ctx: AudioContext
    try {
      ctx = new AudioContext({
        latencyHint: 'playback',
        ...(lowMemoryDevice() ? { sampleRate: 32000 } : {}),
      })
    } catch {
      ctx = new AudioContext({ latencyHint: 'playback' })
    }
    this.ctx = ctx
    void this.ctx.resume()
    this.out = this.ctx.createGain()
    this.out.connect(this.ctx.destination)
    this.fade = this.ctx.createGain()
    this.fade.gain.value = 0
    this.fade.connect(this.out)
    this.metronome = new Metronome(this.ctx)
  }

  /**
   * Baixa e abre as faixas. `onProgress(n, total)` avisa a cada faixa pronta.
   * Devolve a duração (a da faixa mais longa).
   */
  async load(
    sources: TrackSource[],
    gains: Record<string, number>,
    onProgress: (done: number, total: number) => void = () => undefined,
  ): Promise<number> {
    this.pause()
    const gen = ++this.gen
    this.release()
    this.offset = 0
    this.duration = 0
    const opened: { id: string; data: Float32Array[] }[] = []
    let length = 0
    for (const [i, src] of sources.entries()) {
      let res: Response
      try {
        res = await fetch(src.url, { cache: 'no-store' })
      } catch {
        throw new Error(`Não foi possível baixar “${src.name}” (internet ou armazenamento).`)
      }
      if (!res.ok) throw new Error(`O link de “${src.name}” venceu (erro ${res.status}).`)
      let buffer: AudioBuffer
      try {
        buffer = await this.ctx.decodeAudioData(await res.arrayBuffer())
      } catch {
        throw new Error(`Este aparelho não abre o formato de “${src.name}”. Prefira MP3.`)
      }
      if (gen !== this.gen) throw new Error('cancelado')
      const sides = sameSides(buffer) ? [0] : [0, 1]
      // cópia: o AudioBuffer original pode ser liberado logo
      opened.push({
        id: src.id,
        data: sides.map((c) => new Float32Array(buffer.getChannelData(c))),
      })
      length = Math.max(length, buffer.length)
      onProgress(i + 1, sources.length)
    }

    const total = opened.reduce((n, t) => n + t.data.length, 0)
    if (total > MAX_CHANNELS) {
      opened.length = 0
      throw new Error('Faixas demais de uma vez (máximo de 32 canais). Escolha menos faixas.')
    }

    const create = await loadStretch()
    const tracks: Track[] = []
    try {
      for (const t of opened) {
        // todas do mesmo tamanho (faixa mais curta termina em silêncio)
        const data = t.data.map((d) => {
          if (d.length === length) return d
          const padded = new Float32Array(length)
          padded.set(d)
          return padded
        })
        const node = await create(this.ctx, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [data.length],
        })
        if (opened.length > 8) await node.configure({ preset: 'cheaper' })
        await node.addBuffers(
          data,
          data.map((d) => d.buffer),
        )
        const gain = this.ctx.createGain()
        gain.gain.value = gains[t.id] ?? 1
        node.connect(gain).connect(this.fade)
        tracks.push({ id: t.id, node, gain })
      }
      this.latency = tracks.length ? await tracks[0]!.node.latency() : 0
    } catch (err) {
      tracks.forEach(releaseTrack)
      throw err
    } finally {
      opened.length = 0
    }
    if (gen !== this.gen) {
      tracks.forEach(releaseTrack)
      throw new Error('cancelado')
    }
    this.tracks = tracks
    this.duration = length / this.ctx.sampleRate
    this.loadedIds = sources.map((s) => s.id)
    return this.duration
  }

  position(): number {
    if (!this.playing) return this.offset
    return this.positionAt(this.ctx.currentTime)
  }

  tick(): number {
    const p = this.position()
    if (this.playing && p >= this.duration - 0.01) {
      this.pause()
      this.offset = 0
      this.onEnded()
      return 0
    }
    return p
  }

  async play(): Promise<void> {
    await this.ctx.resume()
    if (this.playing || this.tracks.length === 0) return
    if (this.offset >= this.duration - 0.05) this.offset = 0
    const t = this.ctx.currentTime + this.latency + 0.02
    this.fade.gain.cancelScheduledValues(t)
    this.fade.gain.setValueAtTime(0, t)
    this.fade.gain.linearRampToValueAtTime(1, t + FADE)
    this.scheduleAll({
      output: t,
      input: this.offset,
      active: true,
      rate: this.rate,
      semitones: this.semitones,
      formantCompensation: true,
    })
    this.startedAt = t
    this.playing = true
    this.metronome.resume()
  }

  pause() {
    this.metronome.stop()
    if (!this.playing) return
    this.offset = this.position()
    this.playing = false
    const t = this.ctx.currentTime
    this.fade.gain.cancelScheduledValues(t)
    this.fade.gain.setValueAtTime(this.fade.gain.value, t)
    this.fade.gain.linearRampToValueAtTime(0, t + FADE)
    this.scheduleAll({ output: t + FADE + 0.01, active: false })
  }

  async seek(seconds: number) {
    const wasPlaying = this.playing
    if (wasPlaying) this.pause()
    this.offset = Math.max(0, Math.min(seconds, this.duration))
    if (wasPlaying) await this.play()
  }

  setSettings(semitones: number, rate: number) {
    this.semitones = semitones
    this.rate = rate
    this.metronome.setRate(rate)
    if (!this.playing || this.tracks.length === 0) return
    const t = this.ctx.currentTime + this.latency + 0.02
    const pos = this.positionAt(t)
    this.scheduleAll({ output: t, input: pos, active: true, rate, semitones })
    this.offset = pos
    this.startedAt = t
  }

  /** Volume de cada faixa (mudo/solo já resolvidos: 0 = calada). */
  setGains(gains: Record<string, number>) {
    const t = this.ctx.currentTime
    for (const tr of this.tracks) {
      const g = tr.gain.gain
      g.cancelScheduledValues(t)
      g.setValueAtTime(g.value, t)
      g.linearRampToValueAtTime(gains[tr.id] ?? 0, t + FADE)
    }
  }

  setMetronome(on: boolean, bpm: number, beats: number) {
    this.metronome.configure(bpm, beats)
    if (on) this.metronome.start()
    else this.metronome.stop(true)
  }

  setTempo(bpm: number, beats: number) {
    this.metronome.configure(bpm, beats)
  }

  dispose() {
    this.gen++
    this.pause()
    this.metronome.stop(true)
    this.release()
    void this.ctx.close().catch(() => undefined)
  }

  private positionAt(now: number) {
    return positionAt({
      offset: this.offset,
      startedAt: this.startedAt,
      now: Math.max(now, this.startedAt),
      rate: this.rate,
      duration: this.duration,
    })
  }

  /** Mesma programação para todas as faixas: tocam juntas, amostra por amostra. */
  private scheduleAll(change: Parameters<StretchNode['schedule']>[0]) {
    for (const tr of this.tracks) void tr.node.schedule({ ...change })
  }

  private release() {
    this.loadedIds = []
    this.tracks.forEach(releaseTrack)
    this.tracks = []
  }
}

function releaseTrack(tr: Track) {
  void tr.node.dropBuffers().catch(() => undefined)
  tr.node.disconnect()
  tr.gain.disconnect()
}
