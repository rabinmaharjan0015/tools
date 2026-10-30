import { concatBytes, type ByteTransform } from './types'

/* ---------- Percent / URL encoding (byte based: UTF-8 safe) ---------- */

const PCT: string[] = Array.from({ length: 256 }, (_, b) =>
  /[A-Za-z0-9\-_.~]/.test(String.fromCharCode(b))
    ? String.fromCharCode(b)
    : '%' + b.toString(16).toUpperCase().padStart(2, '0'),
)

const hexVal = (c: number) =>
  c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1

export function percentEncoder(): ByteTransform {
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      let s = ''
      for (let i = 0; i < chunk.length; i++) s += PCT[chunk[i]]
      controller.enqueue(Uint8Array.from(s, (c) => c.charCodeAt(0)))
    },
  })
}

export function percentDecoder(plusAsSpace = false): ByteTransform {
  let rest: Uint8Array = new Uint8Array(0)
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const buf = concatBytes(rest, chunk)
      let end = buf.length
      // hold back an incomplete "%" or "%X" until the next chunk arrives
      if (end >= 1 && buf[end - 1] === 0x25) end -= 1
      else if (end >= 2 && buf[end - 2] === 0x25) end -= 2
      rest = buf.slice(end)

      const out = new Uint8Array(end)
      let n = 0
      for (let i = 0; i < end; i++) {
        const c = buf[i]
        if (c === 0x25 && i + 2 < end) {
          const hi = hexVal(buf[i + 1])
          const lo = hexVal(buf[i + 2])
          if (hi >= 0 && lo >= 0) {
            out[n++] = (hi << 4) | lo
            i += 2
            continue
          }
        }
        out[n++] = plusAsSpace && c === 0x2b ? 0x20 : c
      }
      if (n) controller.enqueue(out.subarray(0, n))
    },
    flush(controller) {
      if (rest.length) controller.enqueue(rest)
    },
  })
}

/* ---------- ROT13 and XOR (obfuscation only, NOT security) ---------- */

export function rot13(): ByteTransform {
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const out = chunk.slice()
      for (let i = 0; i < out.length; i++) {
        const c = out[i]
        if (c >= 65 && c <= 90) out[i] = ((c - 65 + 13) % 26) + 65
        else if (c >= 97 && c <= 122) out[i] = ((c - 97 + 13) % 26) + 97
      }
      controller.enqueue(out)
    },
  })
}

export function xorCipher(key: string): ByteTransform {
  const k = new TextEncoder().encode(key)
  if (!k.length) throw new Error('XOR needs a non-empty key')
  let pos = 0
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const out = new Uint8Array(chunk.length)
      for (let i = 0; i < chunk.length; i++) out[i] = chunk[i] ^ k[pos++ % k.length]
      controller.enqueue(out)
    },
  })
}

/* ---------- CRC-32 (truly streaming checksum, emits hex at the end) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export class Crc32 {
  private crc = 0xffffffff
  update(chunk: Uint8Array): void {
    let c = this.crc
    for (let i = 0; i < chunk.length; i++) c = CRC_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8)
    this.crc = c
  }
  hex(): string {
    return ((this.crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
  }
}

export function crc32(): ByteTransform {
  const c = new Crc32()
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk) {
      c.update(chunk)
    },
    flush(controller) {
      controller.enqueue(new TextEncoder().encode(c.hex()))
    },
  })
}
