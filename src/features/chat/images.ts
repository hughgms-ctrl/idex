// Fotos nas conversas: reduzir no aparelho antes de enviar e guardar no
// bucket privado `chat-images` ({igreja}/{conversa}/{uuid}.{ext}).
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export const CHAT_IMAGES_BUCKET = 'chat-images'
/** Lado maior da foto enviada (fica nítida no celular e leve para a internet). */
export const MAX_SIDE = 1600
/** Limite do bucket. */
export const MAX_BYTES = 10 * 1024 * 1024

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/** Tamanho que cabe em `max` x `max` mantendo a proporção (nunca aumenta). */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_SIDE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** É uma foto que dá para mandar? (HEIC do iPhone chega como JPEG pelo seletor.) */
export function isSupportedImage(file: { type: string }): boolean {
  return file.type.startsWith('image/')
}

export type PreparedImage = {
  blob: Blob
  type: string
  ext: string
  width: number
  height: number
}

/**
 * Reduz a foto para no máximo 1600 px e JPEG (foto de celular de 5 MB vira
 * ~300 KB). GIF vai como está (perderia a animação). Se o aparelho não
 * consegue ler a imagem, manda o original quando o formato é aceito.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.type === 'image/gif') {
    if (file.size > MAX_BYTES) throw new Error('O GIF passa de 10 MB.')
    const { width, height } = await imageSize(file).catch(() => ({ width: 0, height: 0 }))
    return { blob: file, type: file.type, ext: 'gif', width, height }
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    if (!ACCEPTED.includes(file.type) || file.size > MAX_BYTES) {
      throw new Error('Não foi possível abrir essa imagem. Tente uma foto em JPG ou PNG.')
    }
    const ext = file.type.split('/')[1] ?? 'jpg'
    return { blob: file, type: file.type, ext: ext === 'jpeg' ? 'jpg' : ext, width: 0, height: 0 }
  }
  const size = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível preparar a foto.')
  ctx.fillStyle = '#fff' // PNG transparente vira fundo branco no JPEG
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  )
  if (!blob) throw new Error('Não foi possível preparar a foto.')
  if (blob.size > MAX_BYTES) throw new Error('A foto ficou grande demais (mais de 10 MB).')
  return { blob, type: 'image/jpeg', ext: 'jpg', ...size }
}

function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('imagem inválida'))
    }
    img.src = url
  })
}

/** Envia a foto e devolve o caminho no bucket. */
export async function uploadChatImage(
  churchId: string,
  conversationId: string,
  image: PreparedImage,
): Promise<string> {
  const path = `${churchId}/${conversationId}/${crypto.randomUUID()}.${image.ext}`
  const { error } = await supabase.storage
    .from(CHAT_IMAGES_BUCKET)
    .upload(path, image.blob, { contentType: image.type, upsert: false })
  if (error) throw new Error(`Não foi possível enviar a foto: ${error.message}`)
  return path
}

/** Apaga a foto do bucket (depois de apagar a mensagem); falha não atrapalha. */
export async function removeChatImage(path: string): Promise<void> {
  await supabase.storage.from(CHAT_IMAGES_BUCKET).remove([path])
}

/** Link assinado da foto (1 h; renova antes de vencer). */
export function useChatImageUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['chat', 'image', path] as const,
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(CHAT_IMAGES_BUCKET)
        .createSignedUrl(path ?? '', 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
}
