import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

const SEND_EVERY_MS = 2_500 // avisa que está digitando no máximo a cada 2,5 s
const SHOW_FOR_MS = 4_500 // some se a pessoa parar de digitar

type Typist = { name: string; until: number }

/**
 * "Fulano está digitando…" pelo Realtime Broadcast, no canal privado
 * `chat:<conversa>` (só entra quem acessa a conversa). Nada vai para o banco.
 */
export function useTyping(conversationId: string, me: { id: string; name: string }) {
  const [typists, setTypists] = useState<Record<string, Typist>>({})
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSent = useRef(0)

  useEffect(() => {
    const channel = supabase.channel(`chat:${conversationId}`, {
      config: { private: true, broadcast: { self: false } },
    })
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { id?: string; name?: string }
        if (!p.id || p.id === me.id) return
        setTypists((t) => ({
          ...t,
          [p.id!]: { name: p.name ?? 'Alguém', until: Date.now() + SHOW_FOR_MS },
        }))
      })
      .on('broadcast', { event: 'stop' }, ({ payload }) => {
        const id = (payload as { id?: string }).id
        if (!id) return
        setTypists((t) => {
          const next = { ...t }
          delete next[id]
          return next
        })
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [conversationId, me.id])

  // tira quem parou de digitar
  const hasTypists = Object.keys(typists).length > 0
  useEffect(() => {
    if (!hasTypists) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      setTypists((t) => {
        const alive = Object.entries(t).filter(([, v]) => v.until > now)
        return alive.length === Object.keys(t).length ? t : Object.fromEntries(alive)
      })
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [hasTypists])

  const notifyTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastSent.current < SEND_EVERY_MS) return
    lastSent.current = now
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { id: me.id, name: me.name },
    })
  }, [me.id, me.name])

  const notifyStopped = useCallback(() => {
    if (!lastSent.current) return
    lastSent.current = 0
    void channelRef.current?.send({ type: 'broadcast', event: 'stop', payload: { id: me.id } })
  }, [me.id])

  // A mensagem chegou: quem enviou já não está digitando
  const clearTypist = useCallback((id: string | null) => {
    if (!id) return
    setTypists((t) => {
      if (!(id in t)) return t
      const next = { ...t }
      delete next[id]
      return next
    })
  }, [])

  return {
    typingNames: Object.values(typists).map((t) => t.name),
    notifyTyping,
    notifyStopped,
    clearTypist,
  }
}
