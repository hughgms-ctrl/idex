import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

const CHECK_EVERY_MS = 60 * 60 * 1000

// Registra o service worker e avisa quando há nova versão publicada.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => void registration.update(), CHECK_EVERY_MS)
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    toast('Nova versão disponível', {
      id: 'pwa-update',
      description: 'Atualize para usar a versão mais recente do ide.x.',
      duration: Infinity,
      action: { label: 'Atualizar', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}
