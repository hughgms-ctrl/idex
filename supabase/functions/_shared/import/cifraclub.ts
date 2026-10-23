// Leitura de uma página de cifra do Cifra Club (HTML) → texto "acordes sobre a
// letra". Função pura: usada pela Edge Function `import-cifra` e testada com
// uma página de exemplo. O Cifra Club não tem API oficial; se o HTML mudar,
// é aqui que se ajusta.

export const CIFRACLUB_HOSTS = ['www.cifraclub.com.br', 'cifraclub.com.br', 'm.cifraclub.com.br']

export type ImportedChords = {
  title: string | null
  artist: string | null
  key: string | null
  text: string
  sourceUrl: string
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

// &aacute; &atilde; &ccedil; ... gerados a partir dos acentos combinantes
const ACCENTS: Record<string, string> = {
  acute: '\u0301',
  grave: '\u0300',
  circ: '\u0302',
  tilde: '\u0303',
  uml: '\u0308',
  cedil: '\u0327',
}

function namedEntity(name: string): string | undefined {
  const direct = ENTITIES[name.toLowerCase()]
  if (direct) return direct
  const m = name.match(/^([a-zA-Z])(acute|grave|circ|tilde|uml|cedil)$/)
  if (!m?.[1] || !m[2]) return undefined
  const combined = (m[1] + ACCENTS[m[2]]).normalize('NFC')
  return combined.length === 1 ? combined : undefined
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => namedEntity(name) ?? m)
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
}

function firstMatch(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) {
      const value = stripTags(m[1]).replace(/\s+/g, ' ').trim()
      if (value) return value
    }
  }
  return null
}

/** Monta a URL da cifra a partir de artista e música (padrão do site). */
export function cifraClubUrl(artist: string, title: string): string {
  return `https://www.cifraclub.com.br/${slug(artist)}/${slug(title)}/`
}

export function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isCifraClubUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && CIFRACLUB_HOSTS.includes(url.hostname)
  } catch {
    return false
  }
}

const TAB_LINE = /^\s*[eBGDAEb]\|[-\d|hpbx/\\~()\s]*\|?\s*$/
const LABEL_WITH_CHORDS = /^\s*\[([^\]]{2,40})\]\s*(.*)$/

/**
 * Extrai a cifra do HTML. Remove tablaturas e transforma "[Intro] G D" em
 * uma linha de seção seguida da linha de acordes.
 */
export function parseCifraClubHtml(html: string, sourceUrl: string): ImportedChords | null {
  const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
  if (!pre?.[1]) return null
  const raw = stripTags(pre[1]).replace(/\r\n?/g, '\n')

  const lines: string[] = []
  let inTab = false
  for (const line of raw.split('\n')) {
    const label = line.match(LABEL_WITH_CHORDS)
    if (label?.[1]) {
      inTab = /^tab\b/i.test(label[1].trim())
      if (inTab) continue
      lines.push(label[1].trim())
      if (label[2]?.trim()) lines.push(label[2])
      continue
    }
    if (TAB_LINE.test(line)) {
      inTab = true
      continue
    }
    if (inTab && line.trim() === '') {
      inTab = false
      continue
    }
    if (inTab) continue
    lines.push(line.replace(/\s+$/, ''))
  }
  const text = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!text) return null

  return {
    title: firstMatch(html, [
      /<h1[^>]*class="[^"]*t1[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
      /<meta property="og:title" content="([^"]+)"/i,
    ]),
    artist: firstMatch(html, [/<h2[^>]*class="[^"]*t3[^"]*"[^>]*>([\s\S]*?)<\/h2>/i]),
    key: firstMatch(html, [
      /id="cifra_tom"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i,
      /id="cifra_tom"[^>]*>\s*(?:tom:)?\s*([A-G][#b]?m?)/i,
    ]),
    text,
    sourceUrl,
  }
}
