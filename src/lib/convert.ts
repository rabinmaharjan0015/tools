/* Time and number-base helpers. */

export function parseTimestamp(input: string): Date | null {
  const s = input.trim()
  if (!s) return null
  let d: Date
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    const a = Math.abs(n)
    const ms = a < 1e11 ? n * 1000 : a < 1e14 ? n : a < 1e17 ? n / 1000 : n / 1e6 // s, ms, µs, ns
    d = new Date(ms)
  } else {
    d = new Date(s)
  }
  return Number.isNaN(d.getTime()) ? null : d
}

export function relativeTime(date: Date, now = Date.now()): string {
  const diff = (date.getTime() - now) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3600], ['minute', 60], ['second', 1],
  ]
  const [unit, secs] = units.find(([, s]) => Math.abs(diff) >= s) ?? units[units.length - 1]
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(diff / secs), unit)
}

export function describeDate(d: Date): [string, string][] {
  return [
    ['ISO 8601', d.toISOString()],
    ['UTC', d.toUTCString()],
    ['Local', d.toString()],
    ['Unix (seconds)', String(Math.floor(d.getTime() / 1000))],
    ['Unix (milliseconds)', String(d.getTime())],
    ['Relative', relativeTime(d)],
  ]
}

/* ---------- number bases (BigInt, any size) ---------- */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const PREFIX: Record<number, string> = { 2: '0b', 8: '0o', 16: '0x' }

export function parseBigInt(input: string, base: number): bigint {
  let s = input.trim().toLowerCase().replace(/[\s_,]/g, '')
  let neg = false
  if (s.startsWith('-')) { neg = true; s = s.slice(1) } else if (s.startsWith('+')) s = s.slice(1)
  if (PREFIX[base] && s.startsWith(PREFIX[base])) s = s.slice(2)
  if (!s) throw new Error('Enter a number')
  const b = BigInt(base)
  let v = 0n
  for (const ch of s) {
    const d = DIGITS.indexOf(ch)
    if (d < 0 || d >= base) throw new Error(`"${ch}" is not a valid base-${base} digit`)
    v = v * b + BigInt(d)
  }
  return neg ? -v : v
}

export const BASES = [2, 8, 10, 16, 32, 36]
export const formatBigInt = (v: bigint, base: number) => v.toString(base)
