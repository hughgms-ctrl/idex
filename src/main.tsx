import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'

import { App } from '@/App'
import { AuthProvider } from '@/auth/AuthProvider'
import { ConfigMissing } from '@/components/ConfigMissing'
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt'
import { Toaster } from '@/components/ui/sonner'
import { envError } from '@/lib/env'
import { persistOptions, queryClient } from '@/lib/query-client'
import '@/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root não encontrado')

createRoot(root).render(
  <StrictMode>
    {envError ? (
      <ConfigMissing detail={envError} />
    ) : (
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
        // o que veio do aparelho é só para abrir rápido/offline: atualiza logo em seguida
        onSuccess={() => void queryClient.invalidateQueries()}
      >
        <AuthProvider>
          <App />
        </AuthProvider>
        <Toaster />
        <UpdatePrompt />
      </PersistQueryClientProvider>
    )}
  </StrictMode>,
)
