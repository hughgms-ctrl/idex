// Avisos por WhatsApp: texto das mensagens, telefone e novas tentativas.
import { DEFAULT_TZ, localParts } from './time.ts'

export type NotificationKind =
  | 'schedule_reminder'
  | 'rehearsal_today'
  | 'points_deducted'
  | 'request_reviewed'
  | 'member_benched'
  | 'event_rescheduled'

export type NotificationPayload = {
  name?: string | null
  church?: string | null
  eventTitle?: string | null
  eventStartsAt?: string | null
  arriveAt?: string | null // chegada da equipe
  soundcheckAt?: string | null // passagem de som
  memberName?: string | null // quem ficou de fora (aviso ao líder)
  scope?: string | null // event | event_and_service
  self?: boolean | null // o aviso é para a própria pessoa?
  oldStartsAt?: string | null // horário antes de remarcar
  role?: string | null
  delta?: number | null
  reason?: string | null
  balance?: number | null
  status?: string | null
  kind?: string | null // pedido | justificativa
  appUrl?: string | null
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const pad = (n: number) => String(n).padStart(2, '0')

function hourOf(iso: string, tz: string): string {
  const p = localParts(iso, tz)
  return `${pad(p.hour)}h${p.minute ? pad(p.minute) : ''}`
}

function when(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  const p = localParts(iso, tz)
  return `${WEEKDAYS[p.weekday]}, ${pad(p.day)}/${pad(p.month)} às ${pad(p.hour)}h${p.minute ? pad(p.minute) : ''}`
}

const REASON: Record<string, string> = {
  late: 'atraso',
  absence: 'falta sem aviso',
  request_rejected: 'pedido de registro recusado',
  adjustment: 'ajuste do líder',
}

/** Texto do WhatsApp (pt-BR). */
export function renderMessage(
  kind: NotificationKind,
  p: NotificationPayload,
  tz = DEFAULT_TZ,
): string {
  const hi = p.name ? `Olá, ${p.name.split(' ')[0]}!` : 'Olá!'
  const link = p.appUrl ? `\n\nAbra o ide.x: ${p.appUrl}` : ''
  const arrival =
    (p.arriveAt ? ` Chegada da equipe: *${hourOf(p.arriveAt, tz)}*.` : '') +
    (p.soundcheckAt ? ` Passagem de som: *${hourOf(p.soundcheckAt, tz)}*.` : '')
  switch (kind) {
    case 'schedule_reminder':
      return `${hi} Lembrete: você está escalado(a)${p.role ? ` como *${p.role}*` : ''} no *${p.eventTitle}* de ${when(p.eventStartsAt, tz)}.${arrival} Se não puder ir, avise o líder pelo app o quanto antes.${link}`
    case 'rehearsal_today':
      return `${hi} Hoje tem *${p.eventTitle ?? 'ensaio'}* ${when(p.eventStartsAt, tz).replace(/^.*?, \d\d\/\d\d /, '')}.${arrival || ' Chegue no horário.'} Bata o ponto pelo app. 🎶${link}`
    case 'points_deducted':
      return `${hi} Foram descontados *${Math.abs(p.delta ?? 0)} pontos* por ${REASON[p.reason ?? ''] ?? 'presença'}${p.eventTitle ? ` (${p.eventTitle}${p.eventStartsAt ? `, ${when(p.eventStartsAt, tz).split(' às')[0]}` : ''})` : ''}.${p.balance !== null && p.balance !== undefined ? ` Seu saldo no ciclo: *${p.balance}*.` : ''}${link}`
    case 'event_rescheduled': {
      const what = p.kind === 'rehearsal' ? 'O ensaio' : 'O evento'
      return `${hi} ${what} *${p.eventTitle ?? ''}* foi remarcado para *${when(p.eventStartsAt, tz)}*${p.oldStartsAt ? ` (era ${when(p.oldStartsAt, tz)})` : ''}.${arrival} Se não puder ir, avise o líder pelo app.${link}`
    }
    case 'member_benched': {
      const where =
        p.scope === 'event_and_service'
          ? 'do ensaio e do culto'
          : `do *${p.eventTitle ?? 'evento'}*`
      return p.self
        ? `${hi} Pela regra de horário do ministério, você ficou de fora ${where}${p.reason ? ` (${p.reason.toLowerCase()})` : ''}. Fale com o líder se precisar.${link}`
        : `${hi} *${p.memberName ?? 'Um integrante'}* ficou de fora ${where} pela regra de horário (${p.eventTitle ?? ''}). Veja a escala e chame um substituto.${link}`
    }
    case 'request_reviewed': {
      const what =
        p.kind === 'justificativa'
          ? 'Seu aviso de falta/atraso'
          : 'Seu pedido de registro de presença'
      const result =
        p.status === 'approved'
          ? 'foi *aprovado* ✅'
          : p.status === 'adjusted'
            ? 'foi *aprovado com ajuste de horário*'
            : 'foi *recusado*'
      return `${hi} ${what}${p.eventTitle ? ` (${p.eventTitle})` : ''} ${result}.${link}`
    }
  }
}

/** Telefone → só dígitos com DDI (Brasil por padrão). null se inválido. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length >= 12 && digits.length <= 15) return digits
  return null
}

/** Espera antes da próxima tentativa (1 min, 5 min, 30 min, 2 h, 6 h). null = desistir. */
export function retryDelayMs(attempts: number): number | null {
  const steps = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000]
  return attempts >= 1 && attempts <= steps.length ? (steps[attempts - 1] ?? null) : null
}

export type PushMessage = { title: string; body: string; url: string; tag: string }

/** Aviso no celular (Web Push): título curto, texto sem formatação e a tela que abre. */
export function renderPush(
  kind: NotificationKind,
  p: NotificationPayload,
  tag: string,
  tz = DEFAULT_TZ,
): PushMessage {
  const plain = renderMessage(kind, { ...p, appUrl: null }, tz)
    .replace(/\*/g, '')
    .replace(/^Olá(, [^!]+)?! /, '')
  switch (kind) {
    case 'schedule_reminder':
      return { title: 'Você está na escala', body: plain, url: '/escalas', tag }
    case 'rehearsal_today':
      return { title: 'Hoje tem ensaio', body: plain, url: '/', tag }
    case 'points_deducted':
      return { title: 'Pontos descontados', body: plain, url: '/presenca', tag }
    case 'request_reviewed':
      return { title: 'Seu pedido foi analisado', body: plain, url: '/presenca', tag }
    case 'event_rescheduled':
      return {
        title: p.kind === 'rehearsal' ? 'Ensaio remarcado' : 'Evento remarcado',
        body: plain,
        url: '/escalas',
        tag,
      }
    case 'member_benched':
      return {
        title: p.self ? 'Você ficou de fora' : `${p.memberName ?? 'Integrante'} ficou de fora`,
        body: plain,
        url: '/escalas',
        tag,
      }
  }
}
