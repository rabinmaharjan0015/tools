/* Secure random generators (all use crypto.getRandomValues). */

export const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n))

/** Unbiased random integer in [0, max) via rejection sampling. */
export function randomInt(max: number): number {
  if (max <= 0 || max > 0x100000000) throw new RangeError('max out of range')
  const limit = Math.floor(0x100000000 / max) * max
  const a = new Uint32Array(1)
  do crypto.getRandomValues(a)
  while (a[0] >= limit)
  return a[0] % max
}

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')
const fmtUuid = (u: Uint8Array) => {
  const h = hex(u)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const uuidv4 = (): string => crypto.randomUUID()

/** UUID v7 (RFC 9562): 48-bit unix-ms timestamp + randomness, so IDs sort by creation time. */
export function uuidv7(now = Date.now()): string {
  const b = randomBytes(16)
  let ts = now
  for (let i = 5; i >= 0; i--) {
    b[i] = ts % 256
    ts = Math.floor(ts / 256)
  }
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  return fmtUuid(b)
}

const URL_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'
export function nanoid(size = 21): string {
  const b = randomBytes(size)
  let id = ''
  for (let i = 0; i < size; i++) id += URL_ALPHABET[b[i] & 63]
  return id
}

export interface PasswordOptions {
  length: number
  lower: boolean
  upper: boolean
  digits: boolean
  symbols: boolean
  excludeAmbiguous: boolean
}

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/',
}

function activeSets(o: PasswordOptions): string[] {
  const strip = (s: string) => (o.excludeAmbiguous ? s.replace(/[Il1O0o|]/g, '') : s)
  return (['lower', 'upper', 'digits', 'symbols'] as const).filter((k) => o[k]).map((k) => strip(SETS[k]))
}

export const passwordPoolSize = (o: PasswordOptions) => activeSets(o).join('').length
export const passwordEntropy = (o: PasswordOptions) => o.length * Math.log2(Math.max(1, passwordPoolSize(o)))

export function randomPassword(o: PasswordOptions): string {
  const sets = activeSets(o)
  if (!sets.length) throw new Error('Select at least one character set')
  if (o.length < sets.length) throw new Error(`Length must be at least ${sets.length} for the selected sets`)
  const pool = sets.join('')
  const chars = sets.map((s) => s[randomInt(s.length)]) // guarantee one of each selected set
  while (chars.length < o.length) chars.push(pool[randomInt(pool.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
