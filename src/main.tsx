import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { App } from '@/App'
import { AuthProvider } from '@/auth/AuthProvider'
import { ConfigMissing } from '@/components/ConfigMissing'
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt'
import { Toaster } from '@/components/ui/sonner'
import { envError } from '@/lib/env'
import '@/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root não encontrado')

createRoot(root).render(
  <StrictMode>
    {envError ? (
      <ConfigMissing detail={envError} />
    ) : (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
        <Toaster />
        <UpdatePrompt />
      </QueryClientProvider>
    )}
  </StrictMode>,
)
