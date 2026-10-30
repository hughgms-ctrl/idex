import type { StretchNode } from 'signalsmith-stretch'

import { isOriginal, positionAt } from '@/features/songs/audio-math'

// Motor do player de referência, sem React.
//
// Qualidade: no tom e andamento originais o arquivo toca direto (nada de
// processamento). Ao mudar tom ou andamento o som passa pelo Signalsmith
// Stretch (MIT, WASM num AudioWorklet), um time-stretch/pitch-shift
// polifônico no domínio da frequência, da mesma família dos usados em DAWs
// (Rubber Band, élastique). Tom e andamento são feitos juntos, numa passada
// só, com compensação de formantes para a voz não ficar "de esquilo".
// A troca entre os dois caminhos é um crossfade curto, sem estalo.

let stretchModule: Promise<typeof import('signalsmith-stretch').default> | null = null
const loadStretch = () => (stretchModule ??= import('signalsmith-stretch').then((m) => m.default))

const FADE = 0.03

type Stretch = { node: StretchNode; gain: GainNode; latency: number; live: boolean }
type Media = {
  audio: HTMLAudioElement
  source: MediaElementAudioSourceNode
  direct: GainNode
}

export class ReferencePlayer {
  readonly ctx: AudioContext
  private out: GainNode
  private buffer: AudioBuffer | null = null
  private media: Media | null = null
  private direct: { node: AudioBufferSourceNode; gain: GainNode } | null = null
  private stretch: Stretch | null = null
  private stretchPending: Promise<Stretch | null> | null = null
  private mode: 'direct' | 'stretch' = 'direct'
  private gen = 0
  // linha do tempo: a posição no arquivo é offset + (agora - startedAt) * timelineRate
  private offset = 0
  private startedAt = 0
  private timelineRate = 1
  private metronome: Metronome
  playing = false
  duration = 0
  semitones = 0
  rate = 1
  /** Avisa quando começa/termina a preparação do processamento (1ª mudança). */
  onPreparing: (preparing: boolean) => void = () => undefined
  onEnded: () => void = () => undefined

  constructor() {
    // iPhone: toca mesmo com a chave do silencioso ligada
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
    this.ctx = new AudioContext({ latencyHint: 'playback' })
    void this.ctx.resume()
    this.out = this.ctx.createGain()
    this.out.connect(this.ctx.destination)
    this.metronome = new Metronome(this.ctx)
  }

  /** Baixa e decodifica o arquivo. Devolve a duração em segundos. */
  async load(url: string): Promise<number> {
    this.pause()
    const gen = ++this.gen
    this.releaseMedia()
    this.releaseStretch()
    this.buffer = null
    this.offset = 0
    this.mode = 'direct'
    // `no-store`: uma resposta guardada sem CORS quebraria o fetch.
    let res: Response
    try {
      res = await fetch(url, { cache: 'no-store' })
    } catch {
      throw new Error('Não foi possível baixar o áudio (internet ou armazenamento).')
    }
    if (!res.ok) {
      throw new Error(`O link do áudio venceu ou o arquivo não foi achado (erro ${res.status}).`)
    }
    const data = await res.arrayBuffer()
    let decoded: AudioBuffer | null = null
    try {
      decoded = await this.ctx.decodeAudioData(data)
    } catch {
      // alguns m4a: o <audio> do aparelho decodifica
    }
    if (gen !== this.gen) throw new Error('cancelado')
    if (decoded) {
      this.buffer = decoded
      this.duration = decoded.duration
    } else {
      try {
        this.duration = await this.openMedia(url)
      } catch {
        throw new Error('Este aparelho não abre este formato no player. Prefira MP3.')
      }
    }
    return this.duration
  }

  position(): number {
    if (this.media) return this.media.audio.currentTime
    if (!this.playing) return this.offset
    return this.positionAt(this.ctx.currentTime)
  }

  /** Chamado pelo relógio da tela: detecta o fim da música. */
  tick(): number {
    const p = this.position()
    if (this.playing && !this.media && p >= this.duration - 0.01) {
      this.pause()
      this.offset = 0
      this.onEnded()
      return 0
    }
    return p
  }

  async play(): Promise<void> {
    await this.ctx.resume()
    if (this.playing) return
    const gen = this.gen
    if (this.media) {
      const { audio } = this.media
      if (this.offset >= audio.duration - 0.05) this.offset = 0
      audio.currentTime = this.offset
      audio.onended = () => {
        this.playing = false
        this.offset = 0
        this.metronome.stop()
        this.onEnded()
      }
      await this.applyMediaSettings()
      await audio.play()
      this.playing = true
      this.metronome.resume()
      return
    }
    if (!this.buffer) {
      this.metronome.resume() // só o metrônomo
      return
    }
    if (this.offset >= this.duration - 0.05) this.offset = 0
    const want = isOriginal(this.semitones, this.rate) ? 'direct' : 'stretch'
    const st = want === 'stretch' ? await this.ensureStretch() : null
    if (gen !== this.gen || this.playing || (want === 'stretch' && !st)) return
    const t = this.ctx.currentTime + (st ? st.latency : 0) + 0.02
    if (st) this.startStretch(st, t, this.offset)
    else this.startDirect(t, this.offset)
    this.mode = want
    this.startedAt = t
    this.timelineRate = st ? this.rate : 1
    this.playing = true
    this.metronome.resume()
  }

  pause() {
    this.metronome.stop()
    if (!this.playing) return
    this.offset = this.position()
    this.playing = false
    if (this.media) {
      this.media.audio.onended = null
      this.media.audio.pause()
      return
    }
    const t = this.ctx.currentTime
    this.stopDirect(t)
    if (this.stretch) this.stopStretch(this.stretch, t)
  }

  async seek(seconds: number) {
    const wasPlaying = this.playing
    if (wasPlaying) this.pause()
    this.offset = Math.max(0, Math.min(seconds, this.duration))
    if (this.media) this.media.audio.currentTime = this.offset
    if (wasPlaying) await this.play()
  }

  async setSettings(semitones: number, rate: number) {
    this.semitones = semitones
    this.rate = rate
    this.metronome.setRate(rate)
    if (this.media) return this.applyMediaSettings()
    if (!this.buffer) return
    const want = isOriginal(semitones, rate) ? 'direct' : 'stretch'
    const gen = this.gen
    const st = want === 'stretch' ? await this.ensureStretch() : this.stretch
    if (gen !== this.gen || !this.playing) return
    // os valores podem ter mudado enquanto o processamento era preparado
    const nowWant = isOriginal(this.semitones, this.rate) ? 'direct' : 'stretch'
    if (nowWant !== want) return
    const t = this.ctx.currentTime + (st ? st.latency : 0) + 0.02
    const pos = this.positionAt(t)
    if (want === 'stretch' && st) {
      if (this.mode === 'stretch') {
        void st.node.schedule({
          output: t,
          input: pos,
          active: true,
          rate: this.rate,
          semitones: this.semitones,
        })
      } else {
        this.startStretch(st, t, pos)
        this.stopDirect(t)
      }
      this.timelineRate = this.rate
    } else if (this.mode === 'stretch') {
      this.startDirect(t, pos)
      if (st) this.stopStretch(st, t)
      this.timelineRate = 1
    }
    this.mode = want
    this.offset = pos
    this.startedAt = t
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
    this.releaseMedia()
    this.releaseStretch()
    void this.ctx.close().catch(() => undefined)
  }

  private positionAt(now: number) {
    return positionAt({
      offset: this.offset,
      startedAt: this.startedAt,
      now: Math.max(now, this.startedAt),
      rate: this.timelineRate,
      duration: this.duration,
    })
  }

  private startDirect(t: number, pos: number) {
    if (!this.buffer) return
    const node = this.ctx.createBufferSource()
    node.buffer = this.buffer
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(1, t + FADE)
    node.connect(gain).connect(this.out)
    node.start(t, pos)
    this.direct = { node, gain }
  }

  private stopDirect(t: number) {
    const d = this.direct
    if (!d) return
    this.direct = null
    d.gain.gain.cancelScheduledValues(t)
    d.gain.gain.setValueAtTime(d.gain.gain.value, t)
    d.gain.gain.linearRampToValueAtTime(0, t + FADE)
    d.node.onended = () => d.gain.disconnect()
    d.node.stop(t + FADE + 0.01)
  }

  private startStretch(st: Stretch, t: number, pos: number) {
    st.gain.gain.cancelScheduledValues(t)
    st.gain.gain.setValueAtTime(0, t)
    st.gain.gain.linearRampToValueAtTime(1, t + FADE)
    void st.node.schedule({
      output: t,
      input: pos,
      active: true,
      rate: this.rate,
      semitones: this.semitones,
      formantCompensation: true,
    })
  }

  private stopStretch(st: Stretch, t: number) {
    st.gain.gain.cancelScheduledValues(t)
    st.gain.gain.setValueAtTime(st.gain.gain.value, t)
    st.gain.gain.linearRampToValueAtTime(0, t + FADE)
    void st.node.schedule({ output: t + FADE + 0.01, active: false })
  }

  /** Cria o processador na 1ª mudança de tom/andamento (e copia o áudio para ele). */
  private ensureStretch(): Promise<Stretch | null> {
    if (this.stretch) return Promise.resolve(this.stretch)
    if (this.stretchPending) return this.stretchPending
    const gen = this.gen
    this.onPreparing(true)
    const pending = (async (): Promise<Stretch | null> => {
      const create = await loadStretch()
      const node = await create(this.ctx, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      })
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      node.connect(gain).connect(this.out)
      const latency = await node.latency()
      const live = !!this.media
      if (this.media) {
        this.media.source.connect(node)
      } else if (this.buffer) {
        const b = this.buffer
        const channels = [0, 1].map((c) =>
          b.getChannelData(Math.min(c, b.numberOfChannels - 1)).slice(),
        )
        await node.addBuffers(
          channels,
          channels.map((c) => c.buffer),
        )
      }
      if (gen !== this.gen) {
        node.disconnect()
        gain.disconnect()
        return null
      }
      this.stretch = { node, gain, latency, live }
      return this.stretch
    })()
      .catch(() => null)
      .finally(() => {
        if (this.stretchPending === pending) this.stretchPending = null
        this.onPreparing(false)
      })
    this.stretchPending = pending
    return pending
  }

  private releaseStretch() {
    this.stretchPending = null
    const st = this.stretch
    if (!st) return
    this.stretch = null
    void st.node.dropBuffers().catch(() => undefined)
    st.node.disconnect()
    st.gain.disconnect()
  }

  /** Abre o arquivo pelo <audio> (precisa de CORS no armazenamento, que o R2 já libera). */
  private async openMedia(url: string): Promise<number> {
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'
    audio.preservesPitch = true // o andamento muda pelo próprio navegador, sem mudar o tom
    const ready = new Promise<void>((resolve, reject) => {
      audio.addEventListener('loadedmetadata', () => resolve(), { once: true })
      audio.addEventListener('error', () => reject(new Error('media')), { once: true })
    })
    audio.src = url
    await ready
    const source = this.ctx.createMediaElementSource(audio)
    const direct = this.ctx.createGain()
    source.connect(direct).connect(this.out)
    this.media = { audio, source, direct }
    return Number.isFinite(audio.duration) ? audio.duration : 0
  }

  /** No modo <audio>: andamento pelo navegador; tom pelo Signalsmith (entrada ao vivo). */
  private async applyMediaSettings() {
    const m = this.media
    if (!m) return
    m.audio.playbackRate = this.rate
    const shifted = this.semitones !== 0
    const st = shifted ? await this.ensureStretch() : this.stretch
    if (m !== this.media) return
    const t = this.ctx.currentTime
    if (st) {
      void st.node.schedule({ active: true, semitones: this.semitones, formantCompensation: true })
      fade(st.gain, t, shifted ? 1 : 0)
    }
    fade(m.direct, t, shifted && st ? 0 : 1)
  }

  private releaseMedia() {
    const m = this.media
    if (!m) return
    this.media = null
    m.audio.onended = null
    m.audio.pause()
    m.audio.removeAttribute('src')
    m.audio.load()
    m.source.disconnect()
    m.direct.disconnect()
  }
}

function fade(g: GainNode, t: number, to: number) {
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(g.gain.value, t)
  g.gain.linearRampToValueAtTime(to, t + FADE)
}

/** Metrônomo agendado no relógio do áudio (acento no 1º tempo do compasso). */
class Metronome {
  private timer: number | null = null
  private next = 0
  private beat = 0
  private bpm = 0
  private beats = 4
  private rate = 1
  private on = false
  private out: GainNode
  private ctx: AudioContext

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.out = ctx.createGain()
    this.out.gain.value = 0.4
    this.out.connect(ctx.destination)
  }

  configure(bpm: number, beats: number) {
    this.bpm = bpm
    this.beats = beats
  }

  setRate(rate: number) {
    this.rate = rate
  }

  /** Liga (e começa a tocar). */
  start() {
    this.on = true
    this.resume()
  }

  /** Volta a tocar se estiver ligado (ex.: ao dar play). */
  resume() {
    if (!this.on || this.timer !== null || !this.bpm) return
    this.next = this.ctx.currentTime + 0.05
    this.beat = 0
    this.timer = window.setInterval(() => this.schedule(), 25)
    this.schedule()
  }

  /** Para de tocar; `off` também desliga. */
  stop(off = false) {
    if (off) this.on = false
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }

  private schedule() {
    while (this.next < this.ctx.currentTime + 0.12) {
      this.click(this.next, this.beat % this.beats === 0)
      this.next += 60 / (this.bpm * this.rate)
      this.beat++
    }
  }

  private click(t: number, accent: boolean) {
    const osc = this.ctx.createOscillator()
    const env = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = accent ? 1046.5 : 784
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(1, t + 0.001)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    osc.connect(env).connect(this.out)
    osc.start(t)
    osc.stop(t + 0.06)
    osc.onended = () => env.disconnect()
  }
}
