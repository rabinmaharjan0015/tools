/* Blob / File / ArrayBuffer / Base64 / Data URL conversions. */

export const bytesToBlob = (bytes: Uint8Array, type = 'application/octet-stream'): Blob =>
  new Blob([bytes as BlobPart], { type })

export const blobToBytes = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer())

/* ---------- Base64 ---------- */

export interface Base64Options {
  urlSafe?: boolean
  /** keep "=" padding (default: true for standard, false for URL-safe) */
  pad?: boolean
  /** insert a newline every N characters (76 = MIME, 64 = PEM) */
  wrap?: number
}

export function bytesToBase64(bytes: Uint8Array, { urlSafe = false, pad = !urlSafe, wrap = 0 }: Base64Options = {}): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x2000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x2000))
  let out = btoa(bin)
  if (urlSafe) out = out.replace(/\+/g, '-').replace(/\//g, '_')
  if (!pad) out = out.replace(/=+$/, '')
  if (wrap > 0) out = out.replace(new RegExp(`(.{${wrap}})`, 'g'), '$1\n').replace(/\n$/, '')
  return out
}

/** Accepts standard or URL-safe Base64, with or without padding, with whitespace. */
export function base64ToBytes(input: string): Uint8Array {
  const s = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  if (!/^[A-Za-z0-9+/]*$/.test(s)) throw new Error('Invalid Base64: contains characters outside the alphabet')
  if (s.length % 4 === 1) throw new Error('Invalid Base64: the length is not valid')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const textToBase64 = (text: string, opts?: Base64Options) => bytesToBase64(new TextEncoder().encode(text), opts)
export const base64ToText = (b64: string) => new TextDecoder().decode(base64ToBytes(b64))

/* ---------- Data URLs ---------- */

export interface ParsedDataURL {
  mime: string
  params: string
  base64: boolean
  bytes: Uint8Array
}

export function parseDataURL(input: string): ParsedDataURL | null {
  const m = /^\s*data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,([\s\S]*)$/i.exec(input)
  if (!m) return null
  const [, mime, params, b64, data] = m
  const bytes = b64 ? base64ToBytes(data) : new TextEncoder().encode(decodeURIComponent(data))
  return { mime: mime || 'text/plain', params, base64: !!b64, bytes }
}

export const bytesToDataURL = (bytes: Uint8Array, mime = 'application/octet-stream') =>
  `data:${mime};base64,${bytesToBase64(bytes)}`

export function dataURLToBlob(url: string): Blob {
  const p = parseDataURL(url)
  if (!p) throw new Error('Not a data URL')
  return bytesToBlob(p.bytes, p.mime)
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error ?? new Error('Could not read the blob'))
    r.readAsDataURL(blob)
  })
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const url = await blobToDataURL(blob)
  return url.slice(url.indexOf(',') + 1)
}

/* ---------- hex and array literals ---------- */

export const bytesToHex = (bytes: Uint8Array, sep = '') => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(sep)

export function hexToBytes(input: string): Uint8Array {
  const s = input.replace(/0x/gi, '').replace(/[\s,:-]/g, '')
  if (!/^[0-9a-fA-F]*$/.test(s)) throw new Error('Invalid hex: use only 0-9 and a-f')
  if (s.length % 2) throw new Error('Invalid hex: odd number of digits')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function bytesToArrayLiteral(bytes: Uint8Array, limit = 256, radix: 10 | 16 = 10): string {
  const shown = Array.from(bytes.subarray(0, limit), (b) => (radix === 16 ? '0x' + b.toString(16).padStart(2, '0') : String(b)))
  const more = bytes.length > limit ? `, /* … ${bytes.length - limit} more */` : ''
  return `new Uint8Array([${shown.join(', ')}${more}])`
}

/* ---------- MIME helpers ---------- */

const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'image/bmp': 'bmp', 'image/x-icon': 'ico', 'image/tiff': 'tif', 'image/avif': 'avif',
  'application/pdf': 'pdf', 'application/zip': 'zip', 'application/gzip': 'gz', 'application/json': 'json',
  'application/xml': 'xml', 'application/wasm': 'wasm', 'application/x-7z-compressed': '7z',
  'application/x-bzip2': 'bz2', 'application/x-xz': 'xz', 'application/vnd.rar': 'rar',
  'text/plain': 'txt', 'text/html': 'html', 'text/css': 'css', 'text/csv': 'csv', 'text/javascript': 'js',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'font/woff': 'woff', 'font/woff2': 'woff2',
}
export const extensionForMime = (mime: string) => MIME_EXT[mime.toLowerCase()] ?? 'bin'

/* ---------- file type sniffing (magic numbers) ---------- */

interface Signature { sig: string; mime: string; ext: string; label: string }
export interface DetectedType { mime: string; ext: string; label: string }

// "??" matches any byte
const SIGNATURES: Signature[] = [
  { sig: '89504e470d0a1a0a', mime: 'image/png', ext: 'png', label: 'PNG image' },
  { sig: 'ffd8ff', mime: 'image/jpeg', ext: 'jpg', label: 'JPEG image' },
  { sig: '47494638', mime: 'image/gif', ext: 'gif', label: 'GIF image' },
  { sig: '52494646????????57454250', mime: 'image/webp', ext: 'webp', label: 'WebP image' },
  { sig: '424d????????00000000', mime: 'image/bmp', ext: 'bmp', label: 'BMP image' },
  { sig: '00000100', mime: 'image/x-icon', ext: 'ico', label: 'ICO icon' },
  { sig: '49492a00', mime: 'image/tiff', ext: 'tif', label: 'TIFF image' },
  { sig: '4d4d002a', mime: 'image/tiff', ext: 'tif', label: 'TIFF image' },
  { sig: '????????6674797061766966', mime: 'image/avif', ext: 'avif', label: 'AVIF image' },
  { sig: '25504446', mime: 'application/pdf', ext: 'pdf', label: 'PDF document' },
  { sig: '504b0304', mime: 'application/zip', ext: 'zip', label: 'ZIP archive (also docx, xlsx, jar, apk)' },
  { sig: '1f8b08', mime: 'application/gzip', ext: 'gz', label: 'Gzip data' },
  { sig: '425a68', mime: 'application/x-bzip2', ext: 'bz2', label: 'Bzip2 data' },
  { sig: 'fd377a585a00', mime: 'application/x-xz', ext: 'xz', label: 'XZ data' },
  { sig: '377abcaf271c', mime: 'application/x-7z-compressed', ext: '7z', label: '7-Zip archive' },
  { sig: '526172211a07', mime: 'application/vnd.rar', ext: 'rar', label: 'RAR archive' },
  { sig: '494433', mime: 'audio/mpeg', ext: 'mp3', label: 'MP3 audio (ID3)' },
  { sig: 'fffb', mime: 'audio/mpeg', ext: 'mp3', label: 'MP3 audio' },
  { sig: '52494646????????57415645', mime: 'audio/wav', ext: 'wav', label: 'WAV audio' },
  { sig: '4f676753', mime: 'audio/ogg', ext: 'ogg', label: 'Ogg container' },
  { sig: '664c6143', mime: 'audio/flac', ext: 'flac', label: 'FLAC audio' },
  { sig: '????????66747970', mime: 'video/mp4', ext: 'mp4', label: 'MP4 / MOV (ISO media)' },
  { sig: '1a45dfa3', mime: 'video/webm', ext: 'webm', label: 'WebM / Matroska' },
  { sig: '774f4646', mime: 'font/woff', ext: 'woff', label: 'WOFF font' },
  { sig: '774f4632', mime: 'font/woff2', ext: 'woff2', label: 'WOFF2 font' },
  { sig: '0061736d', mime: 'application/wasm', ext: 'wasm', label: 'WebAssembly module' },
  { sig: '7f454c46', mime: 'application/x-elf', ext: 'elf', label: 'ELF executable' },
  { sig: '4d5a', mime: 'application/x-msdownload', ext: 'exe', label: 'Windows executable (MZ)' },
  { sig: 'cafebabe', mime: 'application/java-vm', ext: 'class', label: 'Java class / Mach-O fat binary' },
  { sig: '53514c69746520666f726d6174203300', mime: 'application/vnd.sqlite3', ext: 'sqlite', label: 'SQLite database' },
]

const PARSED = SIGNATURES.map((s) => ({
  ...s,
  pattern: (s.sig.match(/.{2}/g) ?? []).map((h) => (h === '??' ? -1 : parseInt(h, 16))),
}))

export function sniffType(bytes: Uint8Array): DetectedType | null {
  for (const s of PARSED) {
    if (bytes.length >= s.pattern.length && s.pattern.every((b, i) => b === -1 || bytes[i] === b)) {
      return { mime: s.mime, ext: s.ext, label: s.label }
    }
  }
  const sample = bytes.subarray(0, 4096)
  if (!sample.length) return null
  let control = 0
  for (const b of sample) if (b < 9 || (b > 13 && b < 32 && b !== 27)) control++
  if (control > 0) return null
  const text = new TextDecoder().decode(sample)
  if ((text.match(/\uFFFD/g)?.length ?? 0) > text.length * 0.01) return null
  const head = text.trimStart().slice(0, 64).toLowerCase()
  if (head.startsWith('<?xml')) return { mime: 'application/xml', ext: 'xml', label: 'XML text' }
  if (head.startsWith('<svg')) return { mime: 'image/svg+xml', ext: 'svg', label: 'SVG image' }
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return { mime: 'text/html', ext: 'html', label: 'HTML text' }
  if (head.startsWith('{') || head.startsWith('[')) return { mime: 'application/json', ext: 'json', label: 'JSON-like text' }
  return { mime: 'text/plain', ext: 'txt', label: 'Plain text' }
}

/** Shannon entropy in bits per byte (0-8). Near 8 suggests compressed or encrypted data. */
export function shannonEntropy(bytes: Uint8Array): number {
  if (!bytes.length) return 0
  const counts = new Uint32Array(256)
  for (let i = 0; i < bytes.length; i++) counts[bytes[i]]++
  let h = 0
  for (const c of counts) {
    if (c) {
      const p = c / bytes.length
      h -= p * Math.log2(p)
    }
  }
  return h
}

/* ---------- images (browser only) ---------- */

export type ImageFormat = 'image/png' | 'image/jpeg' | 'image/webp'

export async function convertImage(
  blob: Blob,
  type: ImageFormat,
  opts: { quality?: number; maxWidth?: number; maxHeight?: number; background?: string } = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, (opts.maxWidth || Infinity) / bmp.width, (opts.maxHeight || Infinity) / bmp.height)
  const width = Math.max(1, Math.round(bmp.width * scale))
  const height = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  if (type === 'image/jpeg') {
    ctx.fillStyle = opts.background ?? '#ffffff' // JPEG has no alpha channel
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(bmp, 0, 0, width, height)
  bmp.close()
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, opts.quality ?? 0.92))
  if (!out) throw new Error(`This browser cannot encode ${type}`)
  return { blob: out, width, height }
}
