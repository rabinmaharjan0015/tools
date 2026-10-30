import type { ByteTransform } from './types'

/**
 * Generic bit-packing codec that powers Base64, Base64URL, Base32 and Hex.
 * Both directions keep a tiny bit accumulator, so they are safe at any chunk boundary.
 */
export interface BitSpec {
  alphabet: string
  /** bits per output character: 6 = base64, 5 = base32, 4 = hex */
  bits: number
  /** pad output with "=" to a multiple of this many chars (0 = no padding) */
  group: number
  caseInsensitive?: boolean
  /** extra characters accepted on decode, mapped onto canonical ones (e.g. "-" -> "+") */
  aliases?: Record<string, string>
}

export const BASE64: BitSpec = {
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  bits: 6,
  group: 4,
  aliases: { '-': '+', _: '/' },
}
export const BASE64URL: BitSpec = {
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  bits: 6,
  group: 0,
  aliases: { '+': '-', '/': '_' },
}
export const BASE32: BitSpec = {
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  bits: 5,
  group: 8,
  caseInsensitive: true,
}
export const HEX: BitSpec = {
  alphabet: '0123456789abcdef',
  bits: 4,
  group: 0,
  caseInsensitive: true,
}

const PAD = 0x3d // "="

export function bitEncoder(spec: BitSpec): ByteTransform {
  const n = spec.bits
  const mask = (1 << n) - 1
  const table = Uint8Array.from(spec.alphabet, (c) => c.charCodeAt(0))
  let value = 0
  let held = 0
  let count = 0

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const out = new Uint8Array(Math.ceil((chunk.length * 8 + held) / n) + 1)
      let k = 0
      for (let i = 0; i < chunk.length; i++) {
        value = (value << 8) | chunk[i]
        held += 8
        while (held >= n) {
          out[k++] = table[(value >>> (held - n)) & mask]
          held -= n
        }
        value &= (1 << held) - 1
      }
      count += k
      if (k) controller.enqueue(out.subarray(0, k))
    },
    flush(controller) {
      const tail: number[] = []
      if (held > 0) {
        tail.push(table[(value << (n - held)) & mask])
        count++
      }
      if (spec.group > 0) while (count % spec.group !== 0) { tail.push(PAD); count++ }
      if (tail.length) controller.enqueue(Uint8Array.from(tail))
    },
  })
}

export function bitDecoder(spec: BitSpec, label: string): ByteTransform {
  const n = spec.bits
  const lookup = new Int16Array(256).fill(-1)
  for (let i = 0; i < spec.alphabet.length; i++) {
    const c = spec.alphabet[i]
    lookup[c.charCodeAt(0)] = i
    if (spec.caseInsensitive) {
      lookup[c.toLowerCase().charCodeAt(0)] = i
      lookup[c.toUpperCase().charCodeAt(0)] = i
    }
  }
  for (const [from, to] of Object.entries(spec.aliases ?? {})) {
    lookup[from.charCodeAt(0)] = spec.alphabet.indexOf(to)
  }
  let value = 0
  let held = 0

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const out = new Uint8Array(Math.ceil((chunk.length * n + held) / 8) + 1)
      let k = 0
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i]
        if (c === 9 || c === 10 || c === 13 || c === 32 || c === PAD) continue // whitespace / padding
        const v = lookup[c]
        if (v < 0) throw new Error(`Invalid ${label} character: "${String.fromCharCode(c)}"`)
        value = (value << n) | v
        held += n
        if (held >= 8) {
          out[k++] = (value >>> (held - 8)) & 0xff
          held -= 8
        }
        value &= (1 << held) - 1
      }
      if (k) controller.enqueue(out.subarray(0, k))
    },
    flush() {
      if (held >= n) throw new Error(`Invalid ${label} input length`)
    },
  })
}
