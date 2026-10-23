import { useMemo } from 'react'

import { readChordPro } from '@/features/songs/chordpro'
import { cn } from '@/lib/utils'

// Cifra no estilo dos protótipos: acorde (verde, mono) sobre a sílaba.
export function ChordSheet({
  chordpro,
  semitones = 0,
  lyricsOnly = false,
  fontScale = 1,
}: {
  chordpro: string
  semitones?: number
  lyricsOnly?: boolean
  fontScale?: number
}) {
  const sections = useMemo(() => {
    try {
      return readChordPro(chordpro, semitones)
    } catch {
      return null
    }
  }, [chordpro, semitones])

  if (!sections) {
    return (
      <p className="text-destructive text-sm">
        Não foi possível ler esta cifra. Peça ao líder para revisar o texto.
      </p>
    )
  }
  if (sections.length === 0) {
    return <p className="text-muted-foreground text-sm">Cifra ainda não cadastrada.</p>
  }

  return (
    <div className="flex flex-col gap-5" style={{ fontSize: `${17 * fontScale}px` }}>
      {sections.map((section, si) => (
        <section key={si} className="flex flex-col gap-2.5">
          {section.label && (
            <span className="bg-muted-foreground text-background self-start rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wider uppercase">
              {section.label}
            </span>
          )}
          {section.lines.map((line, li) => (
            <div key={li} className={cn('flex flex-wrap', !lyricsOnly && 'gap-y-1')}>
              {line.segments.map((seg, gi) => (
                <span key={gi} className="flex flex-col">
                  {!lyricsOnly && (
                    <span
                      className="text-primary h-[1.6em] pr-1.5 font-mono leading-[1.6em] font-semibold"
                      style={{ fontSize: '0.88em' }}
                    >
                      {seg.chord}
                    </span>
                  )}
                  <span className="leading-snug whitespace-pre">{seg.lyrics}</span>
                </span>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
