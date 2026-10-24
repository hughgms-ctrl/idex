import { useCallback, useEffect, useState } from 'react'

import { isIos, isStandalone } from '@/components/pwa/install'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

export type PushState =
  | 'loading'
  | 'unsupported' // navegador sem push (ou app sem chave configurada)
  | 'needs-install' // iPhone: só funciona com o app instalado
  | 'denied' // a pessoa bloqueou as notificações
  | 'off'
  | 'on'

function urlBase64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function supported(): boolean {
  return (
    Boolean(env.VITE_VAPID_PUBLIC_KEY) &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Service worker pronto (no `pnpm dev` não há service worker: desiste em 4s). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
  ])
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
}

// Aviso no celular (Web Push): ativa/desativa neste aparelho.
export type PushDevice = { endpoint: string; user_agent: string | null; created_at: string }

export function usePush() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  // aparelhos da conta com avisos ativos (e o endpoint deste aparelho)
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null)

  const loadDevices = useCallback(async () => {
    const { data } = await supabase
      .from('push_subscriptions')
      .select('endpoint, user_agent, created_at')
      .order('created_at')
    setDevices(data ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      let next: PushState
      if (isIos() && !isStandalone()) next = 'needs-install'
      else if (!supported()) next = 'unsupported'
      else if (Notification.permission === 'denied') next = 'denied'
      else {
        const reg = await registration()
        const sub = reg ? await reg.pushManager.getSubscription() : null
        if (!reg) next = 'unsupported'
        else if (sub && Notification.permission === 'granted') {
          // garante que o aparelho está ligado à conta que entrou agora
          await saveSubscription(sub).catch(() => undefined)
          if (!cancelled) setThisEndpoint(sub.endpoint)
          next = 'on'
        } else next = 'off'
      }
      await loadDevices().catch(() => undefined)
      if (!cancelled) setState(next)
    })()
    return () => {
      cancelled = true
    }
  }, [loadDevices])

  const enable = useCallback(async () => {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        throw new Error('Permita as notificações para receber os avisos.')
      }
      const reg = await registration()
      if (!reg) throw new Error('Abra o app instalado para ativar os avisos.')
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(env.VITE_VAPID_PUBLIC_KEY ?? ''),
        }))
      await saveSubscription(sub)
      setThisEndpoint(sub.endpoint)
      await loadDevices()
      setState('on')
    } finally {
      setBusy(false)
    }
  },[loadDevices])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      const reg = await registration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      setThisEndpoint(null)
      await loadDevices()
      setState('off')
    } finally {
      setBusy(false)
    }
  }, [loadDevices])

  /** Manda um aviso de teste para todos os aparelhos da conta (chega em até 1 minuto). */
  const test = useCallback(async () => {
    const { data, error } = await supabase.rpc('send_test_push')
    if (error) throw error
    if (!data) throw new Error('Ative os avisos neste aparelho primeiro.')
  }, [])

  return { state, busy, enable, disable, test, devices, thisEndpoint }
}
