import { BASE32, BASE64, BASE64URL, HEX, bitDecoder, bitEncoder } from './bits'
import { aesGcmDecrypt, aesGcmEncrypt, shaDigest } from './crypto'
import { md5Stream } from './md5'
import { crc32, percentDecoder, percentEncoder, rot13, xorCipher } from './simple'
import type { ByteTransform, Mode } from './types'

export type CodecId =
  | 'base64' | 'base64url' | 'base32' | 'hex' | 'url'
  | 'gzip' | 'deflate' | 'deflate-raw'
  | 'aes-gcm' | 'xor' | 'rot13'
  | 'crc32' | 'md5' | 'sha-1' | 'sha-256' | 'sha-384' | 'sha-512'

export type CodecGroup = 'Encoding' | 'Compression' | 'Encryption' | 'Obfuscation' | 'Hashing'

export interface StepOptions {
  /** password (AES-GCM) or key (XOR) */
  secret?: string
  /** URL decode: treat "+" as a space (form encoding) */
  plusAsSpace?: boolean
}

export interface CodecDef {
  id: CodecId
  label: string
  group: CodecGroup
  description: string
  /** false for hashes: they only have an "encode" direction */
  reversible: boolean
  secret?: 'Password' | 'Key'
  verbs: { encode: string; decode: string }
  create(mode: Mode, options: StepOptions): ByteTransform
}

const compression = (id: 'gzip' | 'deflate' | 'deflate-raw', label: string, description: string): CodecDef => ({
  id,
  label,
  group: 'Compression',
  description,
  reversible: true,
  verbs: { encode: 'Compress', decode: 'Decompress' },
  create: (mode) =>
    (mode === 'encode' ? new CompressionStream(id) : new DecompressionStream(id)) as unknown as ByteTransform,
})

const sha = (id: CodecId, algo: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'): CodecDef => ({
  id,
  label: algo,
  group: 'Hashing',
  description: `${algo} digest as hex (buffers input; Web Crypto cannot hash incrementally)`,
  reversible: false,
  verbs: { encode: 'Hash', decode: 'Hash' },
  create: () => shaDigest(algo),
})

const pair = (enc: () => ByteTransform, dec: () => ByteTransform) => (mode: Mode) => (mode === 'encode' ? enc() : dec())

export const CODECS: CodecDef[] = [
  { id: 'base64', label: 'Base64', group: 'Encoding', description: 'RFC 4648 Base64 with padding', reversible: true,
    verbs: { encode: 'Encode', decode: 'Decode' },
    create: pair(() => bitEncoder(BASE64), () => bitDecoder(BASE64, 'Base64')) },
  { id: 'base64url', label: 'Base64URL', group: 'Encoding', description: 'URL-safe Base64, no padding', reversible: true,
    verbs: { encode: 'Encode', decode: 'Decode' },
    create: pair(() => bitEncoder(BASE64URL), () => bitDecoder(BASE64, 'Base64URL')) },
  { id: 'base32', label: 'Base32', group: 'Encoding', description: 'RFC 4648 Base32 with padding', reversible: true,
    verbs: { encode: 'Encode', decode: 'Decode' },
    create: pair(() => bitEncoder(BASE32), () => bitDecoder(BASE32, 'Base32')) },
  { id: 'hex', label: 'Hex', group: 'Encoding', description: 'Lowercase hexadecimal', reversible: true,
    verbs: { encode: 'Encode', decode: 'Decode' },
    create: pair(() => bitEncoder(HEX), () => bitDecoder(HEX, 'hex')) },
  { id: 'url', label: 'URL (percent)', group: 'Encoding', description: 'Percent-encoding of every non-unreserved byte', reversible: true,
    verbs: { encode: 'Encode', decode: 'Decode' },
    create: (mode, o) => (mode === 'encode' ? percentEncoder() : percentDecoder(o.plusAsSpace)) },

  compression('gzip', 'Gzip', 'RFC 1952, via the browser CompressionStream'),
  compression('deflate', 'Deflate (zlib)', 'RFC 1950 zlib-wrapped deflate'),
  compression('deflate-raw', 'Deflate (raw)', 'RFC 1951 raw deflate'),

  { id: 'aes-gcm', label: 'AES-256-GCM', group: 'Encryption',
    description: 'PBKDF2-derived key, 64 KiB authenticated frames. Output is binary: add Base64 after it for text.',
    reversible: true, secret: 'Password', verbs: { encode: 'Encrypt', decode: 'Decrypt' },
    create: (mode, o) => (mode === 'encode' ? aesGcmEncrypt(o.secret ?? '') : aesGcmDecrypt(o.secret ?? '')) },

  { id: 'xor', label: 'XOR', group: 'Obfuscation', description: 'Repeating-key XOR. Symmetric and NOT secure.',
    reversible: true, secret: 'Key', verbs: { encode: 'Apply', decode: 'Apply' },
    create: (_m, o) => xorCipher(o.secret ?? '') },
  { id: 'rot13', label: 'ROT13', group: 'Obfuscation', description: 'Letter rotation. Symmetric.', reversible: true,
    verbs: { encode: 'Apply', decode: 'Apply' }, create: () => rot13() },

  { id: 'crc32', label: 'CRC-32', group: 'Hashing', description: 'Streaming CRC-32 checksum as hex', reversible: false,
    verbs: { encode: 'Hash', decode: 'Hash' }, create: () => crc32() },
  { id: 'md5', label: 'MD5', group: 'Hashing', description: 'Streaming MD5 digest as hex. Fine for checksums, not for security.', reversible: false,
    verbs: { encode: 'Hash', decode: 'Hash' }, create: () => md5Stream() },
  sha('sha-1', 'SHA-1'),
  sha('sha-256', 'SHA-256'),
  sha('sha-384', 'SHA-384'),
  sha('sha-512', 'SHA-512'),
]

export const CODEC_BY_ID = Object.fromEntries(CODECS.map((c) => [c.id, c])) as Record<CodecId, CodecDef>
export const CODEC_GROUPS: CodecGroup[] = ['Encoding', 'Compression', 'Encryption', 'Obfuscation', 'Hashing']
