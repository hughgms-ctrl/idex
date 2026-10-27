export type SongLink = { label: string; url: string }

/** Links salvos na música ({label, url}) prontos para virar botões. */
export function songLinks(links: unknown): SongLink[] {
  if (!Array.isArray(links)) return []
  return links.flatMap((l: { label?: unknown; url?: unknown }) => {
    const url = typeof l?.url === 'string' ? l.url.trim() : ''
    if (!/^https?:\/\//i.test(url)) return []
    let host: string
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return []
    }
    const label = typeof l.label === 'string' && l.label.trim() ? l.label.trim() : host
    return [{ label, url }]
  })
}
