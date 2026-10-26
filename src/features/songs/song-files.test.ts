import { describe, expect, it } from 'vitest'

import { fileInfo, sizeLabel } from '@/features/songs/song-files'

describe('arquivos da música', () => {
  it('reconhece áudio, PDF e imagem, mesmo sem tipo informado pelo celular', () => {
    expect(fileInfo({ name: 'guia.mp3', type: 'audio/mpeg' })).toEqual({
      mime: 'audio/mpeg',
      kind: 'audio',
    })
    expect(fileInfo({ name: 'Voz Tenor.M4A', type: '' })).toEqual({
      mime: 'audio/mp4',
      kind: 'audio',
    })
    // MP3 renomeado para .mpeg: o navegador informa vídeo
    expect(fileInfo({ name: 'TREMENDA GRAÇA TOM-G MP3.mp3.mpeg', type: 'video/mpeg' })).toEqual({
      mime: 'audio/mpeg',
      kind: 'audio',
    })
    expect(fileInfo({ name: 'partitura.pdf', type: '' }).kind).toBe('pdf')
    expect(fileInfo({ name: 'mapa.jpg', type: 'image/jpeg' }).kind).toBe('image')
    expect(fileInfo({ name: 'projeto.zip', type: 'application/zip' }).kind).toBe('other')
  })

  it('mostra o tamanho em KB/MB', () => {
    expect(sizeLabel(3_500_000)).toBe('3,3 MB')
    expect(sizeLabel(2048)).toBe('2 KB')
    expect(sizeLabel(null)).toBe('')
  })
})
