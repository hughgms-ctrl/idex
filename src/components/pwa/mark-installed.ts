import { useEffect } from 'react'

import { isStandalone } from '@/components/pwa/install'
import { supabase } from '@/lib/supabase'

// Ao abrir o app instalado, avisa o banco (o líder vê em Membros quem instalou).
// Uma vez por abertura; o banco só regrava se a marca tiver mais de um dia.
let marked = false

export function useMarkAppInstalled() {
  useEffect(() => {
    if (marked || !isStandalone()) return
    marked = true
    void supabase.rpc('mark_app_installed').then(({ error }) => {
      if (error) marked = false
    })
  }, [])
}
