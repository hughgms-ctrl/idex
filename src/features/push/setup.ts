// O que falta para a pessoa receber avisos na tela do celular.
import type { PushState } from '@/features/push/usePush'

export type SetupStep =
  | 'install-ios' // iPhone: instalar na tela de início (sem isso não há aviso)
  | 'enable' // ativar os avisos neste aparelho
  | 'denied' // bloqueou as notificações: liberar nos ajustes
  | 'unsupported' // navegador sem aviso (ex.: Android fora do Chrome)
  | null // pronto (ou não é celular)

export function setupStep(p: { mobile: boolean; push: PushState }): SetupStep {
  if (!p.mobile) return null
  switch (p.push) {
    case 'needs-install':
      return 'install-ios'
    case 'off':
      return 'enable'
    case 'denied':
      return 'denied'
    case 'unsupported':
      return 'unsupported'
    default:
      return null // 'loading' ou 'on'
  }
}

/** Edge no Android não entrega avisos de sites: precisa ser o Chrome. */
export function isAndroidEdge(userAgent = navigator.userAgent) {
  return /Android/i.test(userAgent) && /EdgA\//.test(userAgent)
}

export function isMobile(
  userAgent = navigator.userAgent,
  maxTouchPoints = navigator.maxTouchPoints,
) {
  return (
    /android|iphone|ipad|ipod/i.test(userAgent) ||
    (/macintosh/i.test(userAgent) && maxTouchPoints > 1)
  )
}
