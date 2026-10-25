// Modelos da central de avisos: preenchem título e texto a partir do evento.
// O líder sempre pode editar antes de enviar.
import { localParts } from '@domain/time.ts'

export type TemplateId = 'custom' | 'rehearsal' | 'service' | 'confirm' | 'changed'

export type TemplateEvent = {
  title: string
  kind: string
  starts_at: string
  arrive_at?: string | null
}

export const TEMPLATES: { id: TemplateId; label: string; needsEvent: boolean }[] = [
  { id: 'custom', label: 'Personalizado', needsEvent: false },
  { id: 'rehearsal', label: 'Lembrete de ensaio', needsEvent: true },
  { id: 'service', label: 'Lembrete de culto', needsEvent: true },
  { id: 'confirm', label: 'Confirmar presença', needsEvent: true },
  { id: 'changed', label: 'Mudança de horário', needsEvent: true },
]

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const pad = (n: number) => String(n).padStart(2, '0')

/** "sábado, 24/10 às 19h30" no fuso da igreja */
export function whenLabel(iso: string): string {
  const p = localParts(iso)
  return `${WEEKDAYS[p.weekday]}, ${pad(p.day)}/${pad(p.month)} às ${pad(p.hour)}h${p.minute ? pad(p.minute) : ''}`
}

function hour(iso: string): string {
  const p = localParts(iso)
  return `${pad(p.hour)}h${p.minute ? pad(p.minute) : ''}`
}

/** Título e texto do modelo para o evento escolhido. */
export function fillTemplate(
  id: TemplateId,
  event: TemplateEvent | null,
): { title: string; body: string } | null {
  if (id === 'custom' || !event) return null
  const when = whenLabel(event.starts_at)
  const arrival =
    event.arrive_at && event.arrive_at !== event.starts_at
      ? ` Chegada da equipe: ${hour(event.arrive_at)}.`
      : ''
  switch (id) {
    case 'rehearsal':
      return {
        title: 'Lembrete de ensaio',
        body: `Ensaio ${when}.${arrival} Venham com as músicas estudadas e cheguem no horário. Registre sua presença pelo app.`,
      }
    case 'service':
      return {
        title: `Lembrete: ${event.title}`,
        body: `${event.title} ${when}.${arrival} Se não puder ir, avise pelo app o quanto antes.`,
      }
    case 'confirm':
      return {
        title: 'Confirme sua presença',
        body: `Você está na escala de ${event.title} (${when}). Abra o app e confirme sua presença, ou avise se for se atrasar ou faltar.`,
      }
    case 'changed':
      return {
        title: `Mudança de horário: ${event.title}`,
        body: `Atenção: ${event.title} agora é ${when}.${arrival} Se não puder no novo horário, avise pelo app.`,
      }
  }
}
