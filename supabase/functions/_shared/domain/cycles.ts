// Datas do ciclo de pontos ("2026-11-01" = dia no fuso da igreja).
import { addDaysToKey, parseDateKey } from './time.ts'

const pad = (n: number) => String(n).padStart(2, '0')

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Soma meses a uma data, como o Postgres: 31/01 + 1 mês = 28 ou 29/02. */
export function addMonthsToKey(key: string, months: number): string {
  const { year, month, day } = parseDateKey(key)
  const index = year * 12 + (month - 1) + months
  const y = Math.floor(index / 12)
  const m = (index % 12) + 1
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`
}

/** Último dia de um ciclo de N meses que começa em `startKey` (01/11 + 3 meses → 31/01). */
export function cycleEnd(startKey: string, months: number): string {
  return addDaysToKey(addMonthsToKey(startKey, months), -1)
}

/** Próximo ciclo: começa no dia seguinte ao fim do atual e dura N meses. */
export function nextCycle(endKey: string, months: number): { startsOn: string; endsOn: string } {
  const startsOn = addDaysToKey(endKey, 1)
  return { startsOn, endsOn: cycleEnd(startsOn, months) }
}

/** Quantos meses inteiros o ciclo tem, se for exato (01/11–31/01 → 3); senão null. */
export function wholeMonths(startKey: string, endKey: string): number | null {
  for (let m = 1; m <= 24; m++) if (cycleEnd(startKey, m) === endKey) return m
  return null
}

/** Problema nas datas escolhidas (texto para a tela) ou null. */
export function cycleProblem(p: {
  startsOn: string
  endsOn: string
  today: string
  previousEnd?: string | null
}): string | null {
  if (!p.startsOn || !p.endsOn) return 'Escolha o início e o fim do ciclo.'
  if (p.endsOn <= p.startsOn) return 'O fim precisa ser depois do início.'
  if (p.endsOn < p.today) return 'O fim do ciclo atual não pode ficar no passado.'
  if (p.endsOn > addMonthsToKey(p.startsOn, 24)) return 'O ciclo pode ter no máximo 24 meses.'
  if (p.previousEnd && p.startsOn <= p.previousEnd)
    return `O ciclo anterior foi até ${p.previousEnd.split('-').reverse().join('/')}: comece depois disso.`
  return null
}
