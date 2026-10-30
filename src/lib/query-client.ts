import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 3_600_000, // mantém o cache salvo por uma semana
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

// Cache offline: só estas consultas vão para o armazenamento do aparelho
// (igreja, equipe, minha escala, setlist e cifras do próximo culto).
// Lista pela chave porque o "meta" das consultas não é salvo junto.
const OFFLINE_ROOTS = new Set([
  'my-churches',
  'my-memberships',
  'my-supports',
  'support',
  'ministries',
  'profile',
  'ministry-members',
  'ministry-roles',
  'ministry-settings',
  'next-event',
  'schedule',
  'songs',
])

export function shouldPersistQuery(query: {
  queryKey: readonly unknown[]
  state: { status: string }
}): boolean {
  return query.state.status === 'success' && OFFLINE_ROOTS.has(String(query.queryKey[0]))
}

export const PERSIST_KEY = 'idex.offline-cache'

export const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? safeStorage() : undefined,
  key: PERSIST_KEY,
  throttleTime: 1_000,
})

export const persistOptions = {
  persister,
  maxAge: 7 * 24 * 3_600_000,
  buster: 'v3', // muda quando o formato de algo salvo muda (descarta o cache antigo)
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
}

/** Ao sair da conta, nada do usuário anterior fica no aparelho. */
export function clearOfflineCache() {
  queryClient.clear()
  try {
    localStorage.removeItem(PERSIST_KEY)
  } catch {
    // ignora
  }
}

function safeStorage(): Storage | undefined {
  try {
    const test = '__idex__'
    localStorage.setItem(test, test)
    localStorage.removeItem(test)
    return localStorage
  } catch {
    return undefined
  }
}
