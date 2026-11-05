import { useState } from 'react'
import { Guitar } from 'lucide-react'

import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { detectCapo, realKeyFor } from '@/features/songs/capo'
import { KEY_OPTIONS, normalizeKey, transposeKey } from '@/lib/music'

const FRETS = Array.from({ length: 11 }, (_, i) => i + 1)

/**
 * Cifra escrita com capotraste (acordes na forma do violão): passa os
 * acordes para o tom real, o que a banda toca. Se o texto colado diz
 * "Capotraste na 2ª casa", aparece o aviso pronto; senão, o líder abre
 * "A cifra usa capotraste?" e escolhe a casa.
 */
export function CapoFix({
  text,
  currentKey,
  onApply,
}: {
  text: string
  currentKey: string
  onApply: (fret: number, realKey: string | null) => void
}) {
  const detected = text.trim() ? detectCapo(text) : null
  const [open, setOpen] = useState(false)
  const [fret, setFret] = useState(2)
  const [realKey, setRealKey] = useState('')

  if (detected) {
    const key = realKeyFor(detected, currentKey)
    const shape = detected.shapeKey ?? (key ? transposeKey(key, -detected.fret) : null)
    return (
      <section className="bg-card flex flex-col gap-3 rounded-2xl border border-amber-500/60 p-4">
        <p className="text-sm">
          <strong>Esta cifra usa capotraste na {detected.fret}ª casa</strong>
          {shape ? ` (acordes na forma de ${shape})` : ''}. A banda toca no tom real
          {key ? ` (${key})` : ''}: passe os acordes para ele, senão mudar o tom no app sai errado.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => onApply(detected.fret, key)}
        >
          <Guitar aria-hidden="true" />
          {key ? `Passar acordes para ${key}` : 'Passar acordes para o tom real'}
        </Button>
      </section>
    )
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        disabled={!text.trim()}
        onClick={() => {
          setRealKey(normalizeKey(currentKey) ?? '')
          setOpen(true)
        }}
      >
        <Guitar aria-hidden="true" /> A cifra usa capotraste?
      </Button>
    )
  }

  const shape = realKey ? transposeKey(realKey, -fret) : null
  return (
    <section className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
      <p className="text-muted-foreground text-[13px]">
        Quando o site escreve os acordes na forma do violão com capotraste (ex.: tom F# com
        capotraste na 2ª casa = acordes de E), os acordes sobem até o tom real.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="capo-fret" label="Capotraste na casa">
          <NativeSelect
            id="capo-fret"
            value={String(fret)}
            onChange={(e) => setFret(Number(e.target.value))}
          >
            {FRETS.map((f) => (
              <option key={f} value={f}>
                {f}ª casa
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="capo-key" label="Tom real (o da banda)">
          <NativeSelect id="capo-key" value={realKey} onChange={(e) => setRealKey(e.target.value)}>
            <option value="">—</option>
            {KEY_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {shape && (
        <p className="text-sm">
          Os acordes de hoje estão na forma de <strong>{shape}</strong> e vão ficar em{' '}
          <strong>{realKey}</strong> (cada um sobe {fret} {fret === 1 ? 'meio tom' : 'meios tons'}).
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onApply(fret, realKey || null)
            setOpen(false)
          }}
        >
          Passar acordes para o tom real
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </section>
  )
}
