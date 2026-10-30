/** Every stream in this library moves raw bytes. */
export type ByteTransform = TransformStream<Uint8Array, Uint8Array>

export type Mode = 'encode' | 'decode'

/** Web Crypto wants BufferSource; newer TS lib typings are strict about ArrayBuffer vs SharedArrayBuffer. */
export const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b
  if (b.length === 0) return a
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(2)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
