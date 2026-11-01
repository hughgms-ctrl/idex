// Cor do rótulo de seção da cifra ("Verso", "Refrão"…), pelo nome da parte.
// Cada tipo de parte tem a sua cor; nome desconhecido fica neutro. As cores
// evitam o verde-limão dos acordes e as cores das anotações (roxo e rosa).

export type SectionKind = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'other'

export const SECTION_COLORS: Record<SectionKind, string> = {
  intro: '#9aa6b8',
  verse: '#7cb8ff',
  prechorus: '#f2b35e',
  chorus: '#ff7f6e',
  bridge: '#4fd1b5',
  other: '#b9bec9',
}

// Ordem importa: "pré-refrão" antes de "refrão".
const RULES: [SectionKind, RegExp][] = [
  ['prechorus', /^(pre refrao|pre coro|pre chorus|prechorus|pre)\b/],
  ['chorus', /^(refrao|coro|chorus)\b/],
  ['bridge', /^(ponte|bridge)\b/],
  ['verse', /^(verso|estrofe|verse|parte \d|(primeira|segunda|terceira|quarta|quinta) parte)\b/],
  ['intro', /^(intro|introducao|final|outro|interludio|instrumental|solo|riff|tab|tag|base)\b/],
]

function normalize(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function sectionKind(label: string): SectionKind {
  const name = normalize(label)
  return RULES.find(([, re]) => re.test(name))?.[0] ?? 'other'
}

export function sectionColor(label: string): string {
  return SECTION_COLORS[sectionKind(label)]
}
