// Detecção de plataforma para o banner "Instalar app".

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

export function isIos(
  userAgent = navigator.userAgent,
  maxTouchPoints = navigator.maxTouchPoints,
): boolean {
  // iPadOS se apresenta como Mac, mas tem tela de toque
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1)
}
