// Tipos do pacote signalsmith-stretch (o pacote não traz os seus).
declare module 'signalsmith-stretch' {
  export type StretchSchedule = {
    output?: number
    active?: boolean
    input?: number
    rate?: number
    semitones?: number
    tonalityHz?: number
    formantSemitones?: number
    formantCompensation?: boolean
    formantBaseHz?: number
  }

  export interface StretchNode extends AudioWorkletNode {
    inputTime: number
    schedule(change: StretchSchedule): Promise<unknown>
    start(when?: number): Promise<unknown>
    stop(when?: number): Promise<unknown>
    latency(): Promise<number>
    addBuffers(buffers: Float32Array[], transfer?: Transferable[]): Promise<number>
    dropBuffers(): Promise<unknown>
    configure(config: { blockMs?: number; intervalMs?: number; preset?: string }): Promise<unknown>
  }

  export default function SignalsmithStretch(
    context: BaseAudioContext,
    options?: AudioWorkletNodeOptions,
  ): Promise<StretchNode>
}
