// Links pré-assinados S3 (AWS Signature V4, por query string) sem
// dependências: só WebCrypto. Serve para o Cloudflare R2 (região "auto").

export type S3Credentials = {
  accessKeyId: string
  secretAccessKey: string
  region: string // R2: "auto"
}

const enc = new TextEncoder()

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    'raw',
    key instanceof Uint8Array ? new Uint8Array(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', k, enc.encode(data))
}

/** Codificação de URI da AWS (RFC 3986; "/" fica no caminho). */
export function awsEncode(value: string, keepSlash = false): string {
  return [...enc.encode(value)]
    .map((b) => {
      const c = String.fromCharCode(b)
      if (/[A-Za-z0-9\-_.~]/.test(c) || (keepSlash && c === '/')) return c
      return `%${b.toString(16).toUpperCase().padStart(2, '0')}`
    })
    .join('')
}

function amzDate(date: Date): { long: string; short: string } {
  const long = date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  return { long, short: long.slice(0, 8) }
}

/**
 * URL pré-assinada para `method` em `url` (ex.: https://host/bucket/chave),
 * válida por `expiresSeconds`. Só o cabeçalho `host` é assinado, então o
 * navegador pode mandar Content-Type livremente no PUT.
 */
export async function presignUrl(params: {
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD'
  url: string
  credentials: S3Credentials
  expiresSeconds: number
  now?: Date
  service?: string
}): Promise<string> {
  const { method, credentials, expiresSeconds } = params
  const service = params.service ?? 's3'
  const url = new URL(params.url)
  const { long, short } = amzDate(params.now ?? new Date())
  const scope = `${short}/${credentials.region}/${service}/aws4_request`

  const query: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${credentials.accessKeyId}/${scope}`],
    ['X-Amz-Date', long],
    ['X-Amz-Expires', String(expiresSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ]
  for (const [k, v] of url.searchParams) query.push([k, v])
  const canonicalQuery = query
    .map(([k, v]) => [awsEncode(k), awsEncode(v)] as const)
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const canonicalPath = awsEncode(decodeURIComponent(url.pathname), true)
  const canonicalRequest = [
    method,
    canonicalPath,
    canonicalQuery,
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = ['AWS4-HMAC-SHA256', long, scope, await sha256Hex(canonicalRequest)].join(
    '\n',
  )

  let key = await hmac(enc.encode(`AWS4${credentials.secretAccessKey}`), short)
  key = await hmac(key, credentials.region)
  key = await hmac(key, service)
  key = await hmac(key, 'aws4_request')
  const signature = hex(await hmac(key, stringToSign))

  return `${url.origin}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

/** Assinatura de uma requisição normal (cabeçalho Authorization), p/ chamadas do servidor. */
export async function signedFetch(params: {
  method: string
  url: string
  credentials: S3Credentials
  body?: string
  headers?: Record<string, string>
  now?: Date
  fetchImpl?: typeof fetch
}): Promise<Response> {
  const { method, credentials } = params
  const url = new URL(params.url)
  const { long, short } = amzDate(params.now ?? new Date())
  const body = params.body ?? ''
  const payloadHash = await sha256Hex(body)
  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(params.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    ),
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': long,
  }
  const names = Object.keys(headers).sort()
  const canonicalQuery = [...url.searchParams]
    .map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`)
    .sort()
    .join('&')
  const canonicalRequest = [
    method,
    awsEncode(decodeURIComponent(url.pathname), true),
    canonicalQuery,
    names.map((n) => `${n}:${headers[n]!.trim()}\n`).join(''),
    names.join(';'),
    payloadHash,
  ].join('\n')
  const scope = `${short}/${credentials.region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', long, scope, await sha256Hex(canonicalRequest)].join(
    '\n',
  )
  let key = await hmac(enc.encode(`AWS4${credentials.secretAccessKey}`), short)
  key = await hmac(key, credentials.region)
  key = await hmac(key, 's3')
  key = await hmac(key, 'aws4_request')
  const signature = hex(await hmac(key, stringToSign))
  // o fetch põe o host sozinho
  const sendHeaders = Object.fromEntries(Object.entries(headers).filter(([k]) => k !== 'host'))
  return (params.fetchImpl ?? fetch)(url.toString(), {
    method,
    body: body || undefined,
    headers: {
      ...sendHeaders,
      authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
    },
  })
}
