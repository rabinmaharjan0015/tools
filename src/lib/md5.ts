import type { ByteTransform } from './types'

const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

/** Incremental MD5 (RFC 1321). */
export class MD5 {
  private a = 0x67452301
  private b = 0xefcdab89 | 0
  private c = 0x98badcfe | 0
  private d = 0x10325476
  private buf = new Uint8Array(64)
  private bufLen = 0
  private length = 0
  private w = new Int32Array(16)

  private process(src: Uint8Array, off: number): void {
    const w = this.w
    for (let j = 0; j < 16; j++) {
      const p = off + j * 4
      w[j] = src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)
    }
    let a = this.a, b = this.b, c = this.c, d = this.d
    for (let i = 0; i < 64; i++) {
      let f: number, g: number
      if (i < 16) { f = (b & c) | (~b & d); g = i }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16 }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16 }
      else { f = c ^ (b | ~d); g = (7 * i) % 16 }
      f = (f + a + K[i] + w[g]) | 0
      a = d
      d = c
      c = b
      const s = SHIFTS[i]
      b = (b + ((f << s) | (f >>> (32 - s)))) | 0
    }
    this.a = (this.a + a) | 0
    this.b = (this.b + b) | 0
    this.c = (this.c + c) | 0
    this.d = (this.d + d) | 0
  }

  update(data: Uint8Array): void {
    this.length += data.length
    let i = 0
    if (this.bufLen) {
      const take = Math.min(64 - this.bufLen, data.length)
      this.buf.set(data.subarray(0, take), this.bufLen)
      this.bufLen += take
      i = take
      if (this.bufLen === 64) {
        this.process(this.buf, 0)
        this.bufLen = 0
      }
    }
    for (; i + 64 <= data.length; i += 64) this.process(data, i)
    if (i < data.length) {
      this.buf.set(data.subarray(i), 0)
      this.bufLen = data.length - i
    }
  }

  private clone(): MD5 {
    const m = new MD5()
    m.a = this.a
    m.b = this.b
    m.c = this.c
    m.d = this.d
    m.buf.set(this.buf)
    m.bufLen = this.bufLen
    m.length = this.length
    return m
  }

  /** Returns the hex digest without disturbing the running state, so it can be called repeatedly. */
  digest(): string {
    return this.clone().finish()
  }

  private finish(): string {
    const bits = this.length * 8
    const padLen = (this.bufLen < 56 ? 56 : 120) - this.bufLen
    const pad = new Uint8Array(padLen + 8)
    pad[0] = 0x80
    const dv = new DataView(pad.buffer)
    dv.setUint32(padLen, bits >>> 0, true)
    dv.setUint32(padLen + 4, Math.floor(bits / 2 ** 32) >>> 0, true)
    this.update(pad)
    const out = new Uint8Array(16)
    const odv = new DataView(out.buffer)
    odv.setInt32(0, this.a, true)
    odv.setInt32(4, this.b, true)
    odv.setInt32(8, this.c, true)
    odv.setInt32(12, this.d, true)
    return Array.from(out, (x) => x.toString(16).padStart(2, '0')).join('')
  }
}

export function md5Stream(): ByteTransform {
  const m = new MD5()
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk) {
      m.update(chunk)
    },
    flush(controller) {
      controller.enqueue(new TextEncoder().encode(m.digest()))
    },
  })
}
