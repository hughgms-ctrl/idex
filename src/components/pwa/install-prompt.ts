import { useSyncExternalStore } from 'react'

import { isStandalone, type BeforeInstallPromptEvent } from '@/components/pwa/install'

// Guarda o evento "beforeinstallprompt" (dispara uma vez, logo ao abrir) para
// que o banner e a tela "Instalar app" usem o mesmo botão de instalar.
let promptEvent: BeforeInstallPromptEvent | null = null
let installed = typeof window !== 'undefined' && isStandalone()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    promptEvent = event as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    promptEvent = null
    emit()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useInstallPrompt() {
  const event = useSyncExternalStore(subscribe, () => promptEvent)
  const isInstalled = useSyncExternalStore(subscribe, () => installed)
  return {
    canPrompt: Boolean(event),
    installed: isInstalled,
    /** abre o pedido de instalação do Android/Chrome; true se aceitou */
    install: async (): Promise<boolean> => {
      if (!promptEvent) return false
      await promptEvent.prompt()
      const { outcome } = await promptEvent.userChoice
      promptEvent = null
      if (outcome === 'accepted') installed = true
      emit()
      return outcome === 'accepted'
    },
  }
}
