export function inviteUrl(token: string, origin = window.location.origin): string {
  return `${origin}/convite/${encodeURIComponent(token)}`
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function inviteMessage(
  churchName: string,
  ministryName: string,
  url: string,
  support = false,
): string {
  if (support) {
    return `Você foi convidado para acompanhar a agenda e as cifras do ministério ${ministryName} da ${churchName} no ide.x. Entre por aqui: ${url}`
  }
  return `Você foi convidado para o ministério ${ministryName} da ${churchName} no ide.x. Entre por aqui: ${url}`
}
