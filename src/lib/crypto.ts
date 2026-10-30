import { bs, concatBytes, type ByteTransform } from './types'

/* ---------- SHA digests ----------
 * Web Crypto has no incremental hashing, so these buffer the input and emit the
 * hex digest at the end. (CRC-32 in simple.ts is genuinely streaming.) */

export type ShaAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

export function shaDigest(algorithm: ShaAlgorithm): ByteTransform {
  let all: Uint8Array = new Uint8Array(0)
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk) {
      all = concatBytes(all, chunk)
    },
    async flush(controller) {
      const digest = new Uint8Array(await crypto.subtle.digest(algorithm, bs(all)))
      const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
      controller.enqueue(new TextEncoder().encode(hex))
    },
  })
}

/* ---------- AES-256-GCM, chunked ----------
 *
 * Stream layout:   salt[16] | frame | frame | ... | frame(final)
 * Frame layout:    ctLength u32 | final u8 | iv[12] | ciphertext+tag[ctLength]
 *
 * Every frame is authenticated with its index and "final" flag as AAD, so
 * reordering, dropping or truncating frames is detected on decrypt.
 */

const FRAME = 64 * 1024
const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16
const ITERATIONS = 150_000

async function deriveKey(password: string, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  if (!password) throw new Error('A password is required')
  const base = await crypto.subtle.importKey('raw', bs(new TextEncoder().encode(password)), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bs(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

function aad(index: number, last: boolean): Uint8Array {
  const a = new Uint8Array(5)
  new DataView(a.buffer).setUint32(0, index)
  a[4] = last ? 1 : 0
  return a
}

export function aesGcmEncrypt(password: string): ByteTransform {
  let key: CryptoKey
  let buf: Uint8Array = new Uint8Array(0)
  let index = 0

  const seal = async (plain: Uint8Array, last: boolean, controller: TransformStreamDefaultController<Uint8Array>) => {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(iv), additionalData: bs(aad(index++, last)) }, key, bs(plain)),
    )
    const out = new Uint8Array(5 + IV_LEN + ct.length)
    new DataView(out.buffer).setUint32(0, ct.length)
    out[4] = last ? 1 : 0
    out.set(iv, 5)
    out.set(ct, 5 + IV_LEN)
    controller.enqueue(out)
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    async start(controller) {
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN))
      key = await deriveKey(password, salt, 'encrypt')
      controller.enqueue(salt)
    },
    async transform(chunk, controller) {
      buf = concatBytes(buf, chunk)
      // strictly ">" so a final frame is always left for flush()
      while (buf.length > FRAME) {
        await seal(buf.slice(0, FRAME), false, controller)
        buf = buf.slice(FRAME)
      }
    },
    async flush(controller) {
      await seal(buf, true, controller)
    },
  })
}

export function aesGcmDecrypt(password: string): ByteTransform {
  let key: CryptoKey | null = null
  let buf: Uint8Array = new Uint8Array(0)
  let index = 0
  let sawLast = false

  return new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      buf = concatBytes(buf, chunk)
      if (!key) {
        if (buf.length < SALT_LEN) return
        key = await deriveKey(password, buf.slice(0, SALT_LEN), 'decrypt')
        buf = buf.slice(SALT_LEN)
      }
      for (;;) {
        if (buf.length === 0) break
        if (sawLast) throw new Error('Unexpected data after the final encrypted block')
        if (buf.length < 5) break
        const len = new DataView(buf.buffer, buf.byteOffset).getUint32(0)
        if (len < TAG_LEN || len > FRAME + TAG_LEN) throw new Error('Corrupted encrypted data')
        const total = 5 + IV_LEN + len
        if (buf.length < total) break

        const last = buf[4] === 1
        const iv = buf.slice(5, 5 + IV_LEN)
        const ct = buf.slice(5 + IV_LEN, total)
        let plain: ArrayBuffer
        try {
          plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: bs(iv), additionalData: bs(aad(index++, last)) },
            key,
            bs(ct),
          )
        } catch {
          throw new Error('Decryption failed: wrong password or corrupted data')
        }
        buf = buf.slice(total)
        sawLast = last
        if (plain.byteLength) controller.enqueue(new Uint8Array(plain))
      }
    },
    flush() {
      if (!sawLast || buf.length) throw new Error('Encrypted data is truncated')
    },
  })
}
