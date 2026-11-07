// Alertas da escala que o líder mandou ignorar (ex.: ele sabe que a pessoa
// vai mesmo assim). Fica neste aparelho; volta se o motivo do alerta mudar
// (a chave é escala + tipo do problema).
const KEY = 'idex:alertas-ignorados'

export function alertKey(assignmentId: string, kind: string): string {
  return `${assignmentId}:${kind}`
}

export function ignoredAlerts(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((k) => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

function save(keys: Set<string>): Set<string> {
  try {
    // guarda só os 500 mais recentes
    localStorage.setItem(KEY, JSON.stringify([...keys].slice(-500)))
  } catch {
    // sem armazenamento: vale até recarregar
  }
  return keys
}

export function ignoreAlert(key: string): Set<string> {
  const keys = ignoredAlerts()
  keys.add(key)
  return save(keys)
}

/** Mostra de novo os alertas ignorados destas escalas. */
export function unignoreEvent(assignmentIds: string[]): Set<string> {
  const keys = ignoredAlerts()
  for (const k of [...keys]) {
    if (assignmentIds.some((id) => k.startsWith(`${id}:`))) keys.delete(k)
  }
  return save(keys)
}
