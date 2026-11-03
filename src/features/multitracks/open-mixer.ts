// O mixer abre em outra janela no computador (a cifra continua tocando nesta;
// volume, mudo e solo chegam aqui na hora). No celular e no app instalado,
// abre na mesma tela e volta para a cifra.

export function mixerPath(songId: string) {
  return `/multitracks/${songId}`
}

export function opensInNewWindow(): boolean {
  if (typeof window === 'undefined') return false
  const standalone = matchMedia('(display-mode: standalone)').matches
  const coarse = matchMedia('(pointer: coarse)').matches
  return !standalone && !coarse && window.innerWidth >= 900
}

/** Devolve false quando a janela não abriu (bloqueador de pop-up): navegar na mesma. */
export function openMixerWindow(songId: string): boolean {
  const w = window.open(
    `${mixerPath(songId)}?janela=1`,
    `idex-mixer-${songId}`,
    'popup,width=560,height=820',
  )
  if (!w) return false
  w.focus()
  return true
}
