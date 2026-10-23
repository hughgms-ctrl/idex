// Cliente mínimo da Evolution API (WhatsApp).
// Variáveis: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE.

export type EvolutionConfig = { url: string; apiKey: string; instance: string }

export function makeEvolutionSender(config: EvolutionConfig, fetchImpl: typeof fetch = fetch) {
  return async (
    phone: string,
    text: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const res = await fetchImpl(
        `${config.url.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(config.instance)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
          body: JSON.stringify({ number: phone, text }),
          signal: AbortSignal.timeout(15_000),
        },
      )
      if (res.ok) return { ok: true }
      const body = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status} ${body.slice(0, 200)}` }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
