import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

const CHECK_EVERY_MS = 15 * 60 * 1000
// ao voltar para o app (que fica aberto em segundo plano no celular)
const MIN_GAP_ON_RESUME_MS = 60 * 1000

// Registra o service worker e avisa quando há nova versão publicada.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      let lastCheck = Date.now()
      const check = () => {
        lastCheck = Date.now()
        void registration.update()
      }
      setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastCheck > MIN_GAP_ON_RESUME_MS) check()
      })
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
