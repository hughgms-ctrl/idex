// Cria/atualiza o .env.local com a URL e a chave "anon" do Supabase local.
// Roda sozinho depois do `pnpm db:start`.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export function parseStatusEnv(output) {
  const vars = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) vars[match[1]] = match[2]
  }
  const url = vars.API_URL
  const key = vars.ANON_KEY || vars.PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Não encontrei API_URL/ANON_KEY na saída do `supabase status`.')
  return { url, key }
}

function main() {
  let output
  try {
    output = execFileSync('supabase', ['status', '-o', 'env'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    })
  } catch {
    console.error(
      'O Supabase local não está rodando. Rode `pnpm db:start` primeiro (com o Docker aberto).',
    )
    process.exit(1)
  }
  const { url, key } = parseStatusEnv(output)
  const file = '.env.local'
  const keep = existsSync(file)
    ? readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter(
          (l) =>
            l && !l.startsWith('VITE_SUPABASE_URL=') && !l.startsWith('VITE_SUPABASE_ANON_KEY='),
        )
    : []
  writeFileSync(
    file,
    [`VITE_SUPABASE_URL=${url}`, `VITE_SUPABASE_ANON_KEY=${key}`, ...keep].join('\n') + '\n',
  )
  console.log(`✔ ${file} pronto (Supabase local em ${url}).`)

  // Segredo do QR para as Edge Functions locais (fica fora do git)
  const fnEnv = 'supabase/functions/.env'
  if (!existsSync(fnEnv) || !readFileSync(fnEnv, 'utf8').includes('QR_SECRET=')) {
    const previous = existsSync(fnEnv) ? readFileSync(fnEnv, 'utf8').trimEnd() + '\n' : ''
    writeFileSync(fnEnv, `${previous}QR_SECRET=${randomBytes(32).toString('hex')}\n`)
    console.log(`✔ ${fnEnv} criado com um QR_SECRET local.`)
  }
}

if (process.argv[1]?.endsWith('env-local.mjs')) main()
