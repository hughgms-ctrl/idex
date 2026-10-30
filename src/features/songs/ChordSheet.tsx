import { useMemo, type ClipboardEvent, type CSSProperties } from 'react'

import {
  readChordPro,
  sheetToHtml,
  sheetToText,
  type SheetSection,
} from '@/features/songs/chordpro'
import { noteColorValue, useNoteColor } from '@/features/songs/note-color'
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
  const noteColor = useNoteColor()
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
    <div
      className="flex flex-col gap-5"
      style={
        { fontSize: `${17 * fontScale}px`, '--note': noteColorValue(noteColor) } as CSSProperties
      }
      onCopy={(e) => copySelection(e, sections, lyricsOnly)}
    >
      {sections.map((section, si) => (
        <section key={si} className="flex flex-col gap-2.5">
          {section.label && (
            <span
              data-sheet-label={si}
              className="text-note bg-note/12 border-note/45 self-start rounded-lg border px-2.5 py-1 text-[0.72em] leading-none font-bold tracking-wider uppercase"
            >
              {section.label}
            </span>
          )}
          {section.lines.map((line, li) => (
            <div
              key={li}
              data-sheet-line={`${si}:${li}`}
              className={cn('flex flex-wrap', !lyricsOnly && 'gap-y-1')}
            >
              {line.segments.map((seg, gi) => (
                <span key={gi} className="flex flex-col">
                  {!lyricsOnly && (
                    <span
                      className="text-primary h-[1.6em] pr-1.5 font-mono leading-[1.6em] font-semibold"
                      style={{ fontSize: '0.88em' }}
                    >
                      {seg.chord ||
                        (seg.note && (
                          <span className="text-note font-sans font-semibold italic">
                            {seg.note}
                          </span>
                        ))}
                    </span>
                  )}
                  <span data-sheet-lyrics className="leading-snug whitespace-pre">
                    {seg.lyrics}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

/**
 * Copiar: o navegador juntaria acorde e sílaba em linhas soltas. Copiamos as
 * linhas selecionadas inteiras no formato da tela (acordes em cima da letra).
 * Seleção dentro de um pedaço só da letra fica como o navegador faz.
 */
function copySelection(
  e: ClipboardEvent<HTMLDivElement>,
  sections: SheetSection[],
  lyricsOnly: boolean,
) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
  const common = selection.getRangeAt(0).commonAncestorContainer
  const commonEl = common instanceof Element ? common : common.parentElement
  if (commonEl?.closest('[data-sheet-lyrics]')) return

  const root = e.currentTarget
  const picked: SheetSection[] = []
  sections.forEach((section, si) => {
    const label = root.querySelector(`[data-sheet-label="${si}"]`)
    const lines = section.lines.filter((_, li) => {
      const el = root.querySelector(`[data-sheet-line="${si}:${li}"]`)
      return !!el && selection.containsNode(el, true)
    })
    const withLabel = !!label && selection.containsNode(label, true)
    if (lines.length || withLabel) picked.push({ label: withLabel ? section.label : null, lines })
  })
  if (picked.length === 0) return
  e.preventDefault()
  e.clipboardData.setData('text/plain', sheetToText(picked, lyricsOnly))
  e.clipboardData.setData('text/html', sheetToHtml(picked, lyricsOnly))
}
