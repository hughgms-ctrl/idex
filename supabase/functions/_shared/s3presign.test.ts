import { describe, expect, it } from 'vitest'

import { awsEncode, presignUrl, signedFetch } from './s3presign.ts'

// Exemplos oficiais da documentação da AWS (Signature Version 4)
const creds = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
}
const now = new Date('2013-05-24T00:00:00Z')

describe('assinatura S3 (R2)', () => {
  it('link pré-assinado bate com o exemplo da AWS', async () => {
    const url = await presignUrl({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      credentials: creds,
      expiresSeconds: 86400,
      now,
    })
    expect(url).toContain(
      'X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    )
    expect(url).toContain(
      'X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request',
    )
  })

  it('requisição assinada (cabeçalho) bate com o exemplo da AWS', async () => {
    let auth = ''
    await signedFetch({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      credentials: creds,
      headers: { Range: 'bytes=0-9' },
      now,
      fetchImpl: (async (_u: string, init?: RequestInit) => {
        auth = (init?.headers as Record<string, string>).authorization ?? ''
        return new Response('')
      }) as typeof fetch,
    })
    expect(auth).toContain('SignedHeaders=host;range;x-amz-content-sha256;x-amz-date')
    expect(auth).toContain(
      'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
  })

  it('codifica nomes de arquivo com acento e espaço', () => {
    expect(awsEncode('igreja/música 1.mp3', true)).toBe('igreja/m%C3%BAsica%201.mp3')
  })
})
