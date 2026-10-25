// O pacote não traz tipos; só o que o player usa (ver o README do pacote).
declare module 'signalsmith-stretch' {
  export type StretchNode = AudioWorkletNode & {
    start(when?: number): Promise<void>
    stop(when?: number): Promise<void>
    schedule(change: {
      output?: number
      active?: boolean
      semitones?: number
      tonalityHz?: number
      formantSemitones?: number
      formantCompensation?: boolean
    }): Promise<void>
    latency(): Promise<number>
  }
  export default function SignalsmithStretch(
    context: BaseAudioContext,
    options?: AudioWorkletNodeOptions,
  ): Promise<StretchNode>
}
