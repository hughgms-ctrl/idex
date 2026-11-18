// Faixas guardadas em pedaços compactos (Int16, metade do Float32) e sem os
// trechos de silêncio — em multitracks muitas faixas (FX, guitarras extras,
// pads) ficam caladas boa parte da música. Na hora de tocar, cada pedaço vira
// um AudioBuffer pequeno, criado pouco antes de ser ouvido.
//
// Emenda sem estalo: cada pedaço guarda `OVERLAP` amostras a mais do começo do
// próximo; o fim dele desce em rampa e o começo do próximo sobe na mesma rampa.
// Como as amostras da emenda são as mesmas nos dois, a soma é o som original.

export const SEGMENT_SECONDS = 4
export const OVERLAP = 128
/** Pico abaixo disso (≈ −74 dB) = silêncio: o pedaço não é guardado. */
export const SILENCE = 0.0002

/** Um pedaço: um Int16Array por canal (com a sobra da emenda), ou null = silêncio. */
export type Segment = Int16Array[] | null

export function segmentFrames(sampleRate: number): number {
  return Math.round(SEGMENT_SECONDS * sampleRate)
}

/** Corta os canais em pedaços de `frames` amostras (+ sobra), sem guardar os silenciosos. */
export function toSegments(channels: Float32Array[], frames: number): Segment[] {
  const length = channels[0]?.length ?? 0
  const count = Math.ceil(length / frames)
  const out: Segment[] = []
  for (let k = 0; k < count; k++) {
    const start = k * frames
    const end = Math.min(length, start + frames + OVERLAP)
    let peak = 0
    for (const ch of channels) {
      for (let i = start; i < end; i++) {
        const v = Math.abs(ch[i]!)
        if (v > peak) peak = v
      }
      if (peak >= SILENCE) break
    }
    if (peak < SILENCE) {
      out.push(null)
      continue
    }
    out.push(
      channels.map((ch) => {
        const seg = new Int16Array(end - start)
        for (let i = 0; i < seg.length; i++) {
          const v = ch[start + i]!
          seg[i] = v >= 1 ? 32767 : v <= -1 ? -32767 : Math.round(v * 32767)
        }
        return seg
      }),
    )
  }
  return out
}

/**
 * Amostras prontas para tocar (Float32), com rampa de entrada (se não for o
 * 1º pedaço) e de saída (só na sobra, quando ela existe).
 */
export function segmentToFloat(
  seg: Int16Array,
  index: number,
  frames: number,
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(seg.length)
  for (let i = 0; i < seg.length; i++) out[i] = seg[i]! / 32767
  if (index > 0) {
    for (let i = 0; i < OVERLAP && i < out.length; i++) out[i]! *= i / OVERLAP
  }
  const tail = seg.length - frames
  if (tail > 0) {
    for (let i = 0; i < tail; i++) out[frames + i]! *= 1 - i / tail
  }
  return out
}

/** Bytes guardados (para o limite de memória do aparelho). */
export function segmentsBytes(segs: Segment[]): number {
  let n = 0
  for (const s of segs) if (s) for (const ch of s) n += ch.byteLength
  return n
}
