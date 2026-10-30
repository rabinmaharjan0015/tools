import { Crc32 } from './simple'
import { MD5 } from './md5'
import { createTracker, type Progress } from './download'
import { bs, type ByteTransform } from './types'

export type HashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' | 'CRC32'
export const HASH_ALGOS: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'CRC32']

export interface Hasher {
  algo: HashAlgo
  update(chunk: Uint8Array): void
  digest(): Promise<string>
}

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')

/** MD5 and CRC32 are incremental. SHA family buffers (Web Crypto has no incremental API). */
export function createHasher(algo: HashAlgo): Hasher {
  if (algo === 'MD5') {
    const m = new MD5()
    return { algo, update: (c) => m.update(c), digest: async () => m.digest() }
  }
  if (algo === 'CRC32') {
    const c = new Crc32()
    return { algo, update: (x) => c.update(x), digest: async () => c.hex() }
  }
  const parts: Uint8Array[] = []
  return {
    algo,
    update: (c) => void parts.push(c),
    digest: async () =>
      hex(new Uint8Array(await crypto.subtle.digest(algo, await new Blob(parts as BlobPart[]).arrayBuffer()))),
  }
}

export interface HashOptions {
  total?: number | null
  onProgress?: (p: Progress) => void
  signal?: AbortSignal
}

export async function hashStream(
  stream: ReadableStream<Uint8Array>,
  algos: HashAlgo[],
  opts: HashOptions = {},
): Promise<Record<string, string>> {
  const hashers = algos.map(createHasher)
  const tracker = createTracker(opts.total ?? null, opts.onProgress)
  const reader = stream.getReader()
  try {
    for (;;) {
      opts.signal?.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      for (const h of hashers) h.update(value)
      tracker.add(value.length)
    }
  } catch (e) {
    void reader.cancel().catch(() => {})
    throw e
  }
  tracker.finish()
  const out: Record<string, string> = {}
  for (const h of hashers) out[h.algo] = await h.digest()
  return out
}

export const hashBlob = (blob: Blob, algos: HashAlgo[], opts: HashOptions = {}) =>
  hashStream(blob.stream() as ReadableStream<Uint8Array>, algos, { ...opts, total: blob.size })

export const hashBytes = (bytes: Uint8Array, algos: HashAlgo[]) => hashBlob(new Blob([bytes as BlobPart]), algos)

/** Pass-through stream that feeds a hasher (use with downloadStream's `taps`). */
export function hashTap(hasher: Hasher): ByteTransform {
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      hasher.update(chunk)
      controller.enqueue(chunk)
    },
  })
}

export type HmacAlgo = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

export async function hmacBytes(algo: HmacAlgo, key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (!key.length) throw new Error('HMAC key must not be empty')
  const k = await crypto.subtle.importKey('raw', bs(key), { name: 'HMAC', hash: algo }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, bs(data)))
}

export async function hmacHex(algo: HmacAlgo, key: Uint8Array, data: Uint8Array): Promise<string> {
  return hex(await hmacBytes(algo, key, data))
}
