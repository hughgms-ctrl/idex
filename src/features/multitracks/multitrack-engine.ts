import type { StretchNode } from 'signalsmith-stretch'

import { Metronome } from '@/features/songs/audio-engine'
import { positionAt } from '@/features/songs/audio-math'
import { busShift, MAX_CHANNELS, trackKind, type TrackKind } from '@/features/multitracks/mix'

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
// Memória: faixa estéreo com os dois lados iguais vira mono; celular usa 32 kHz.

let stretchModule: Promise<typeof import('signalsmith-stretch').default> | null = null
const loadStretch = () => (stretchModule ??= import('signalsmith-stretch').then((m) => m.default))

const FADE = 0.03
const BLOCK_MS = 300
const KINDS: TrackKind[] = ['instrument', 'voice', 'fixed']

export type TrackSource = { id: string; url: string; name: string }

type Track = { id: string; kind: TrackKind; buffer: AudioBuffer; gain: GainNode }

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
  private sources: AudioBufferSourceNode[] = []
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
    const opened: { id: string; kind: TrackKind; buffer: AudioBuffer }[] = []
    let channels = 0
    for (const [i, src] of sources.entries()) {
      let res: Response
      try {
        res = await fetch(src.url, { cache: 'no-store' })
      } catch {
        throw new Error(`Não foi possível baixar “${src.name}” (internet ou armazenamento).`)
      }
      if (!res.ok) throw new Error(`O link de “${src.name}” venceu (erro ${res.status}).`)
      let decoded: AudioBuffer
      try {
        decoded = await this.ctx.decodeAudioData(await res.arrayBuffer())
      } catch {
        throw new Error(`Este aparelho não abre o formato de “${src.name}”. Prefira MP3.`)
      }
      if (gen !== this.gen) throw new Error('cancelado')
      let buffer = decoded
      if (decoded.numberOfChannels > 2 || (decoded.numberOfChannels === 2 && sameSides(decoded))) {
        // mono (ou só os 2 primeiros canais): metade da memória
        const n = sameSides(decoded) ? 1 : 2
        buffer = this.ctx.createBuffer(n, decoded.length, decoded.sampleRate)
        for (let c = 0; c < n; c++) buffer.copyToChannel(decoded.getChannelData(c), c)
      }
      channels += buffer.numberOfChannels
      if (channels > MAX_CHANNELS) {
        opened.length = 0
        throw new Error('Faixas demais de uma vez (máximo de 32 canais). Escolha menos faixas.')
      }
      opened.push({ id: src.id, kind: trackKind(src.name), buffer })
      onProgress(i + 1, sources.length)
    }

    // grupos que têm faixa; processadores criados agora (sem atraso no 1º play)
    const kinds = KINDS.filter((k) => opened.some((t) => t.kind === k))
    try {
      await this.ensureBuses(kinds)
    } catch {
      // sem processador (aparelho sem AudioWorklet): toca só no tom original
    }
    if (gen !== this.gen) throw new Error('cancelado')

    this.tracks = opened.map((t) => {
      const gain = this.ctx.createGain()
      gain.gain.value = gains[t.id] ?? 1
      const bus = this.buses.find((b) => b.kind === t.kind) ?? this.buses[0]
      if (bus) gain.connect(bus.input)
      return { ...t, gain }
    })
    this.duration = Math.max(0, ...opened.map((t) => t.buffer.duration))
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
      for (const s of this.sources) s.playbackRate.setValueAtTime(rate, t)
      this.offset = pos
      this.startedAt = heard
      this.rate = rate
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
    this.sources = []
    for (const tr of this.tracks) {
      if (pos >= tr.buffer.duration) continue
      const s = this.ctx.createBufferSource()
      s.buffer = tr.buffer
      s.playbackRate.value = this.rate
      s.connect(tr.gain)
      s.start(t, pos)
      this.sources.push(s)
    }
  }

  private stopSources(when: number) {
    for (const s of this.sources) {
      s.onended = () => s.disconnect()
      try {
        s.stop(when)
      } catch {
        s.disconnect()
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
