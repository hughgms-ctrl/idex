import type { StretchNode } from 'signalsmith-stretch'

import { Metronome } from '@/features/songs/audio-engine'
import { positionAt } from '@/features/songs/audio-math'
import { busShift, trackKind, type TrackKind } from '@/features/multitracks/mix'
import {
  segmentFrames,
  segmentsBytes,
  segmentToFloat,
  toSegments,
  type Segment,
} from '@/features/multitracks/segments'
import { fetchTrack, type TrackDownload } from '@/features/multitracks/track-cache'

// Motor do Multitracks, sem React.
//
// Leve para o celular: as faixas tocam como `AudioBufferSourceNode` (sem
// custo) e são somadas em até 3 grupos — instrumentos, vozes e click/guia.
// Cada grupo tem UM processador Signalsmith (entrada ao vivo), qualquer que
// seja o número de faixas. Antes era um processador por faixa: 8 faixas = 8
// processadores pesados e o celular engasgava.
//
// Andamento: todas as faixas tocam com `playbackRate = rate` (andamento e tom
// mudam juntos, amostra por amostra iguais); o processador do grupo desfaz o
// tom do andamento e aplica o tom escolhido (`busShift`). No tom e andamento
// originais nenhum processador roda: o som vai direto (com um atraso igual ao
// do processador, para a troca entre os caminhos ser só um crossfade).
//
// Afinação: o bloco padrão do Signalsmith (120 ms) é curto para o grave — um
// baixo, ao mudar o tom, saía até ~60 centésimos fora (medido no Chromium; o
// preset `cheaper` era pior). Com 300 ms o erro cai para poucos centésimos.
// Todos os grupos usam o mesmo bloco (mesma latência, ficam alinhados).
// `splitComputation` espalha a conta no tempo (sem picos que engasgam).
// Click/guia não mudam de tom; só o grupo das vozes tem compensação de formantes.
//
// Memória (músicas com 20, 30 faixas): cada faixa fica guardada em pedaços de
// 4 s em Int16 (metade do Float32) e sem os pedaços em silêncio
// (`segments.ts`); estéreo com os lados iguais vira mono; celular usa 32 kHz.
// Na hora de tocar, os pedaços dos próximos segundos viram AudioBuffers
// pequenos (`LOOKAHEAD`), agendados no relógio do áudio, emendados sem estalo.

let stretchModule: Promise<typeof import('signalsmith-stretch').default> | null = null
const loadStretch = () => (stretchModule ??= import('signalsmith-stretch').then((m) => m.default))

const FADE = 0.03
const BLOCK_MS = 300
const KINDS: TrackKind[] = ['instrument', 'voice', 'fixed']
/** Segundos agendados à frente (folga para o celular atrasar o relógio da tela). */
const LOOKAHEAD = 8
/** Faixas baixadas/abertas ao mesmo tempo. */
const PARALLEL = 3

export type TrackSource = TrackDownload

type Track = {
  id: string
  kind: TrackKind
  segs: Segment[]
  channels: number
  frames: number
  gain: GainNode
}
type Scheduled = { node: AudioBufferSourceNode; when: number }

type Bus = {
  kind: TrackKind
  input: GainNode
  delay: DelayNode
  dry: GainNode
  wet: GainNode
  stretch: StretchNode | null
  /** Meios tons aplicados agora (0 = caminho direto). */
  shift: number
}

/** Quanto as faixas guardadas podem ocupar (Int16, sem silêncio). */
function memoryBudget(): number {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (lowMemoryDevice()) return 700 * 1024 * 1024
  return (mem && mem >= 8 ? 2500 : 1500) * 1024 * 1024
}

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

function ramp(g: GainNode, t: number, to: number) {
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(g.gain.value, t)
  g.gain.linearRampToValueAtTime(to, t + FADE)
}

export class MultitrackPlayer {
  readonly ctx: AudioContext
  private out: GainNode
  private fade: GainNode
  private buses: Bus[] = []
  private tracks: Track[] = []
  private sources: Scheduled[] = []
  private timer: number | null = null
  // relógio das fontes (antes do processador): a entrada `srcInput` sai em `srcTime`
  private srcTime = 0
  private srcInput = 0
  private nextSeg = 0
  private segFrames = 0
  private latency = 0
  private gen = 0
  // posição ouvida = offset + (agora - startedAt) * rate
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
    this.releaseTracks()
    this.offset = 0
    this.duration = 0
    const frames = segmentFrames(this.ctx.sampleRate)
    this.segFrames = frames
    const budget = memoryBudget()
    let used = 0
    let done = 0
    const opened: (Omit<Track, 'gain'> | undefined)[] = new Array(sources.length)
    const openOne = async (src: TrackSource, i: number) => {
      const bytes = await fetchTrack(src)
      if (gen !== this.gen) throw new Error('cancelado')
      let decoded: AudioBuffer
      try {
        decoded = await this.ctx.decodeAudioData(bytes)
      } catch {
        throw new Error(`Este aparelho não abre o formato de “${src.name}”. Prefira MP3.`)
      }
      if (gen !== this.gen) throw new Error('cancelado')
      // mono quando os lados são iguais; no máximo 2 canais
      const n = sameSides(decoded) ? 1 : 2
      const chans = Array.from({ length: n }, (_, c) => decoded.getChannelData(c))
      const segs = toSegments(chans, frames)
      used += segmentsBytes(segs)
      if (used > budget) {
        throw new Error(
          'As faixas não cabem na memória deste aparelho. Desligue algumas no mixer (as que estão sempre caladas, por exemplo).',
        )
      }
      opened[i] = {
        id: src.id,
        kind: trackKind(src.name),
        segs,
        channels: n,
        frames: decoded.length,
      }
      onProgress(++done, sources.length)
    }
    let cursor = 0
    const worker = async () => {
      while (cursor < sources.length) {
        const i = cursor++
        await openOne(sources[i]!, i)
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, sources.length) }, worker))
    } catch (err) {
      opened.length = 0
      throw err
    }

    // grupos que têm faixa; processadores criados agora (sem atraso no 1º play)
    const kinds = KINDS.filter((k) => opened.some((t) => t?.kind === k))
    try {
      await this.ensureBuses(kinds)
    } catch {
      // sem processador (aparelho sem AudioWorklet): toca só no tom original
    }
    if (gen !== this.gen) throw new Error('cancelado')

    this.tracks = opened.flatMap((t) => {
      if (!t) return []
      const gain = this.ctx.createGain()
      gain.gain.value = gains[t.id] ?? 1
      const bus = this.buses.find((b) => b.kind === t.kind) ?? this.buses[0]
      if (bus) gain.connect(bus.input)
      return [{ ...t, gain }]
    })
    this.duration = Math.max(0, ...this.tracks.map((t) => t.frames)) / this.ctx.sampleRate
    this.loadedIds = sources.map((s) => s.id)
    this.applyShifts(this.ctx.currentTime, true)
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
    const t = this.ctx.currentTime + 0.03
    this.startSources(t, this.offset)
    // o som sai com o atraso do processador (o caminho direto tem o mesmo atraso)
    const heard = t + this.latency
    this.fade.gain.cancelScheduledValues(t)
    this.fade.gain.setValueAtTime(0, heard)
    this.fade.gain.linearRampToValueAtTime(1, heard + FADE)
    this.startedAt = heard
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
    this.stopSources(t + FADE + 0.01)
  }

  async seek(seconds: number) {
    const wasPlaying = this.playing
    if (wasPlaying) this.pause()
    this.offset = Math.max(0, Math.min(seconds, this.duration))
    if (wasPlaying) await this.play()
  }

  setSettings(semitones: number, rate: number) {
    const rateChanged = rate !== this.rate
    this.semitones = semitones
    this.metronome.setRate(rate)
    if (!this.playing) {
      this.rate = rate
      this.applyShifts(this.ctx.currentTime, true)
      return
    }
    const t = this.ctx.currentTime + 0.03
    const heard = t + this.latency
    if (rateChanged) {
      // a posição ouvida em `heard` corresponde à entrada em `t`
      const pos = this.positionAt(heard)
      // o pedaço que já está tocando muda de velocidade; os seguintes são
      // reagendados no novo andamento
      const keep: Scheduled[] = []
      for (const sc of this.sources) {
        if (sc.when < t) {
          sc.node.playbackRate.setValueAtTime(rate, t)
          keep.push(sc)
        } else {
          sc.node.onended = null
          sc.node.stop()
          sc.node.disconnect()
        }
      }
      this.sources = keep
      this.srcTime = t
      this.srcInput = pos
      this.nextSeg = Math.floor(pos / (this.segFrames / this.ctx.sampleRate)) + 1
      this.offset = pos
      this.startedAt = heard
      this.rate = rate
      this.scheduleAhead()
    }
    this.applyShifts(heard, false)
  }

  /** Volume de cada faixa (mudo/solo já resolvidos: 0 = calada). */
  setGains(gains: Record<string, number>) {
    const t = this.ctx.currentTime
    for (const tr of this.tracks) ramp(tr.gain, t, gains[tr.id] ?? 0)
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
    this.releaseTracks()
    for (const b of this.buses) {
      b.stretch?.disconnect()
      b.input.disconnect()
      b.delay.disconnect()
      b.dry.disconnect()
      b.wet.disconnect()
    }
    this.buses = []
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

  private startSources(t: number, pos: number) {
    this.stopSources(t)
    const segSeconds = this.segFrames / this.ctx.sampleRate
    const k0 = Math.floor(pos / segSeconds)
    this.srcTime = t
    this.srcInput = pos
    this.nextSeg = k0
    this.scheduleAhead()
    if (this.timer === null) this.timer = window.setInterval(() => this.scheduleAhead(), 250)
  }

  /** Agenda os pedaços que vão tocar nos próximos `LOOKAHEAD` segundos. */
  private scheduleAhead() {
    const sr = this.ctx.sampleRate
    const segSeconds = this.segFrames / sr
    const horizon = this.ctx.currentTime + LOOKAHEAD
    const total = Math.ceil((this.duration * sr) / this.segFrames)
    while (this.nextSeg < total) {
      const k = this.nextSeg
      const segStart = k * segSeconds
      // o 1º pedaço pode começar no meio (posição de onde voltou a tocar)
      const offset = Math.max(0, this.srcInput - segStart)
      const when = this.srcTime + (segStart + offset - this.srcInput) / this.rate
      if (when > horizon) break
      this.nextSeg++
      for (const tr of this.tracks) {
        const seg = tr.segs[k]
        if (!seg) continue
        const length = seg[0]!.length
        if (offset * sr >= length) continue
        const buffer = this.ctx.createBuffer(tr.channels, length, sr)
        seg.forEach((ch, c) => buffer.copyToChannel(segmentToFloat(ch, k, this.segFrames), c))
        const node = this.ctx.createBufferSource()
        node.buffer = buffer
        node.playbackRate.value = this.rate
        node.connect(tr.gain)
        node.start(Math.max(when, this.ctx.currentTime), offset)
        const sc: Scheduled = { node, when }
        node.onended = () => {
          node.disconnect()
          this.sources = this.sources.filter((x) => x !== sc)
        }
        this.sources.push(sc)
      }
    }
  }

  private stopSources(when: number) {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    for (const sc of this.sources) {
      sc.node.onended = () => sc.node.disconnect()
      try {
        sc.node.stop(Math.max(when, sc.when))
      } catch {
        sc.node.disconnect()
      }
    }
    this.sources = []
  }

  /**
   * Liga o processador só nos grupos que precisam; os outros vão direto.
   * `at` = quando a mudança deve ser ouvida.
   */
  private applyShifts(at: number, immediate: boolean) {
    for (const b of this.buses) {
      const shift = b.stretch ? busShift(b.kind, this.semitones, this.rate) : 0
      const wasWet = b.shift !== 0
      const wet = shift !== 0
      if (b.stretch) {
        if (wet) {
          // a mudança chega na saída depois da latência: programa para `at`
          void b.stretch.schedule({
            ...(immediate ? {} : { output: at }),
            active: true,
            semitones: shift,
            formantCompensation: b.kind === 'voice',
          })
        } else if (wasWet) {
          void b.stretch.schedule({ output: at + FADE + 0.01, active: false })
        } else if (immediate) {
          void b.stretch.schedule({ active: false })
        }
      }
      if (wet !== wasWet || immediate) {
        if (immediate) {
          b.wet.gain.value = wet ? 1 : 0
          b.dry.gain.value = wet ? 0 : 1
        } else {
          ramp(b.wet, at, wet ? 1 : 0)
          ramp(b.dry, at, wet ? 0 : 1)
        }
      }
      b.shift = shift
    }
  }

  private async ensureBuses(kinds: TrackKind[]) {
    const missing = kinds.filter((k) => !this.buses.some((b) => b.kind === k))
    if (missing.length === 0) return
    const create = await loadStretch().catch(() => null)
    for (const kind of missing) {
      const input = this.ctx.createGain()
      input.channelCount = 2
      input.channelCountMode = 'explicit'
      const delay = this.ctx.createDelay(2)
      const dry = this.ctx.createGain()
      const wet = this.ctx.createGain()
      wet.gain.value = 0
      input.connect(delay).connect(dry).connect(this.fade)
      wet.connect(this.fade)
      let stretch: StretchNode | null = null
      if (create) {
        try {
          stretch = await create(this.ctx, {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          })
          await stretch.configure({
            blockMs: BLOCK_MS,
            intervalMs: BLOCK_MS / 4,
            splitComputation: true,
          })
          void stretch.schedule({ active: false })
          input.connect(stretch)
          stretch.connect(wet)
          this.latency = Math.max(this.latency, await stretch.latency())
        } catch {
          stretch = null
        }
      }
      this.buses.push({ kind, input, delay, dry, wet, stretch, shift: 0 })
    }
    // caminho direto com o mesmo atraso do processador: trocar é só um crossfade
    for (const b of this.buses) b.delay.delayTime.value = Math.min(2, this.latency)
  }

  private releaseTracks() {
    this.stopSources(this.ctx.currentTime)
    this.loadedIds = []
    for (const tr of this.tracks) tr.gain.disconnect()
    this.tracks = []
  }
}
