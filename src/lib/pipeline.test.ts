import { describe, expect, it } from 'vitest'
import { CODECS, rechunk, runPipeline, transform, type Step } from './index'

const enc = new TextEncoder()
const dec = new TextDecoder()
const TEXT = 'Namaste नेपाल 🇳🇵 — streams are fun! %&=? +'
const bin = (s: string) => btoa(String.fromCharCode(...enc.encode(s)))
const step = (codec: Step['codec'], mode: Step['mode'], secret?: string): Step => ({
  id: `${codec}-${mode}`, codec, mode, options: { secret },
})

describe('known vectors', () => {
  it('base64 matches btoa', async () => {
    expect(dec.decode(await transform(TEXT, 'base64'))).toBe(bin(TEXT))
  })
  it('base32 (RFC 4648)', async () => {
    expect(dec.decode(await transform('foobar', 'base32'))).toBe('MZXW6YTBOI======')
    expect(dec.decode(await transform('MZXW6YTBOI======', 'base32', 'decode'))).toBe('foobar')
  })
  it('hex / url / base64url', async () => {
    expect(dec.decode(await transform('hi!', 'hex'))).toBe('686921')
    expect(dec.decode(await transform('a b&c', 'url'))).toBe('a%20b%26c')
    expect(dec.decode(await transform(new Uint8Array([251, 255]), 'base64url'))).toBe('-_8')
  })
  it('crc32 / sha-256', async () => {
    expect(dec.decode(await transform('123456789', 'crc32'))).toBe('cbf43926')
    expect(dec.decode(await transform('abc', 'sha-256'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('round trips at awkward chunk sizes', () => {
  const reversible = CODECS.filter((c) => c.reversible)
  for (const chunkSize of [1, 2, 3, 7, 4096]) {
    for (const c of reversible) {
      it(`${c.id} @ ${chunkSize}`, async () => {
        const secret = c.secret ? 'pw' : undefined
        const input = enc.encode(TEXT.repeat(3))
        const e = await runPipeline(input, [step(c.id, 'encode', secret)], { chunkSize })
        const d = await runPipeline(e.output, [step(c.id, 'decode', secret)], { chunkSize })
        expect(dec.decode(d.output)).toBe(TEXT.repeat(3))
      })
    }
  }
})

describe('aes-gcm', () => {
  it('handles multi-frame data', async () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 251)
    const e = await runPipeline(big, [step('aes-gcm', 'encode', 'pw')])
    const d = await runPipeline(e.output, [step('aes-gcm', 'decode', 'pw')], { chunkSize: 999 })
    expect(d.output).toEqual(big)
  })
  it('rejects wrong password, truncation and tampering', async () => {
    const e = (await runPipeline(enc.encode(TEXT), [step('aes-gcm', 'encode', 'pw')])).output
    await expect(runPipeline(e, [step('aes-gcm', 'decode', 'nope')])).rejects.toThrow(/Decryption failed/)
    await expect(runPipeline(e.slice(0, e.length - 5), [step('aes-gcm', 'decode', 'pw')])).rejects.toThrow()
    const bad = e.slice()
    bad[bad.length - 1] ^= 1
    await expect(runPipeline(bad, [step('aes-gcm', 'decode', 'pw')])).rejects.toThrow()
  })
})

describe('chains and helpers', () => {
  it('gzip -> base64 -> back', async () => {
    const steps = [step('gzip', 'encode'), step('base64', 'encode')]
    const e = await runPipeline(enc.encode(TEXT.repeat(50)), steps)
    const back = steps.map((s) => ({ ...s, mode: 'decode' as const })).reverse()
    expect(dec.decode((await runPipeline(e.output, back)).output)).toBe(TEXT.repeat(50))
  })
  it('rechunk emits fixed-size chunks', async () => {
    const out: number[] = []
    const rs = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new Uint8Array(10)); c.enqueue(new Uint8Array(7)); c.close() },
    }).pipeThrough(rechunk(6))
    const r = rs.getReader()
    for (;;) { const { done, value } = await r.read(); if (done) break; out.push(value.length) }
    expect(out).toEqual([6, 6, 5])
  })
  it('rejects invalid input', async () => {
    await expect(transform('@@@@', 'base64', 'decode')).rejects.toThrow(/Invalid Base64/)
  })
})
