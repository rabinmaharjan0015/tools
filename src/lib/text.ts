import { hexToBytes } from './blob'

/* ---------- HTML entities ---------- */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', euro: '€',
  pound: '£', yen: '¥', cent: '¢', deg: '°', times: '×', divide: '÷', laquo: '«', raquo: '»',
  middot: '·', bull: '•', sect: '§', para: '¶', plusmn: '±', frac12: '½',
}

export function htmlEncode(s: string, allNonAscii = false): string {
  const esc: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  if (!allNonAscii) return s.replace(/[&<>"']/g, (m) => esc[m])
  return Array.from(s, (ch) => {
    const cp = ch.codePointAt(0) ?? 0
    return cp > 126 || ch in esc ? `&#${cp};` : ch
  }).join('')
}

export const htmlDecode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m
    }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m
  })

/* ---------- Unicode escapes ---------- */

export const unicodeEscape = (s: string, onlyNonAscii = true): string =>
  Array.from(s, (ch) => {
    const cp = ch.codePointAt(0) ?? 0
    if (onlyNonAscii && cp < 128) return ch
    return cp > 0xffff ? `\\u{${cp.toString(16)}}` : `\\u${cp.toString(16).padStart(4, '0')}`
  }).join('')

export const unicodeUnescape = (s: string): string =>
  s.replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (m, a?: string, b?: string, c?: string) => {
    const cp = parseInt(a ?? b ?? c ?? '', 16)
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : m
  })

/* ---------- bytes as text in other bases ---------- */

const RADIX_PAD: Record<number, number> = { 2: 8, 8: 3, 10: 1, 16: 2 }
const DIGIT_RE: Record<number, RegExp> = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i }

export const textToRadix = (s: string, radix: 2 | 8 | 10 | 16, sep = ' '): string =>
  Array.from(new TextEncoder().encode(s), (b) => b.toString(radix).padStart(RADIX_PAD[radix], '0')).join(sep)

export function radixToText(s: string, radix: 2 | 8 | 10 | 16): string {
  if (radix === 16) return new TextDecoder().decode(hexToBytes(s))
  let tokens = s.trim().split(/[\s,]+/).filter(Boolean)
  if (radix === 2 && tokens.length === 1 && tokens[0].length > 8) tokens = tokens[0].match(/.{1,8}/g) ?? []
  const bytes = tokens.map((t) => {
    if (!DIGIT_RE[radix].test(t)) throw new Error(`"${t}" is not a valid base-${radix} number`)
    const v = parseInt(t, radix)
    if (v > 255) throw new Error(`"${t}" is larger than one byte (255)`)
    return v
  })
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

/* ---------- case conversion ---------- */

const words = (s: string) =>
  s
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
const perLine = (fn: (line: string) => string) => (s: string) => s.split('\n').map(fn).join('\n')
const joinWords = (sep: string, f: (w: string, i: number) => string) => perLine((l) => words(l).map(f).join(sep))

export const CASE_FNS: Record<string, (s: string) => string> = {
  camelCase: joinWords('', (w, i) => (i ? cap(w) : w.toLowerCase())),
  PascalCase: joinWords('', cap),
  snake_case: joinWords('_', (w) => w.toLowerCase()),
  CONSTANT_CASE: joinWords('_', (w) => w.toUpperCase()),
  'kebab-case': joinWords('-', (w) => w.toLowerCase()),
  'dot.case': joinWords('.', (w) => w.toLowerCase()),
  'path/case': joinWords('/', (w) => w.toLowerCase()),
  'Title Case': (s) => s.replace(/\p{L}[\p{L}\p{N}']*/gu, cap),
  'Sentence case': perLine((l) => l.charAt(0).toUpperCase() + l.slice(1).toLowerCase()),
  lowercase: (s) => s.toLowerCase(),
  UPPERCASE: (s) => s.toUpperCase(),
}

export const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/* ---------- line tools ---------- */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export const LINE_FNS: Record<string, (lines: string[]) => string[]> = {
  'Sort A → Z': (l) => [...l].sort(collator.compare),
  'Sort Z → A': (l) => [...l].sort((a, b) => collator.compare(b, a)),
  'Remove duplicates': (l) => [...new Set(l)],
  'Reverse order': (l) => [...l].reverse(),
  'Trim each line': (l) => l.map((x) => x.trim()),
  'Remove empty lines': (l) => l.filter((x) => x.trim() !== ''),
  Shuffle: (l) => {
    const a = [...l]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  },
  'Number lines': (l) => l.map((x, i) => `${i + 1}. ${x}`),
}

/* ---------- stats ---------- */

export function textStats(s: string) {
  const trimmed = s.trim()
  const w = trimmed ? trimmed.split(/\s+/).length : 0
  return {
    Characters: Array.from(s).length,
    'No spaces': Array.from(s.replace(/\s/g, '')).length,
    Words: w,
    Lines: s ? s.split('\n').length : 0,
    Paragraphs: trimmed ? trimmed.split(/\n\s*\n/).length : 0,
    'UTF-8 bytes': new TextEncoder().encode(s).length,
    'Reading time': `${Math.max(w ? 1 : 0, Math.round(w / 200))} min`,
  }
}

/* ---------- operation table for the UI ---------- */

export interface TextOp { id: string; group: string; label: string; run: (input: string) => string }

const caseOps: TextOp[] = Object.entries(CASE_FNS).map(([label, run]) => ({ id: `case-${label}`, group: 'Case', label, run }))
const lineOps: TextOp[] = Object.entries(LINE_FNS).map(([label, fn]) => ({
  id: `line-${label}`, group: 'Lines', label, run: (s) => fn(s.split('\n')).join('\n'),
}))

export const TEXT_OPS: TextOp[] = [
  { id: 'html-enc', group: 'HTML entities', label: 'Encode', run: (s) => htmlEncode(s) },
  { id: 'html-enc-all', group: 'HTML entities', label: 'Encode (non-ASCII too)', run: (s) => htmlEncode(s, true) },
  { id: 'html-dec', group: 'HTML entities', label: 'Decode', run: htmlDecode },
  { id: 'uni-enc', group: 'Unicode escapes', label: 'Escape non-ASCII', run: (s) => unicodeEscape(s) },
  { id: 'uni-enc-all', group: 'Unicode escapes', label: 'Escape everything', run: (s) => unicodeEscape(s, false) },
  { id: 'uni-dec', group: 'Unicode escapes', label: 'Unescape', run: unicodeUnescape },
  { id: 'bin-enc', group: 'Bytes as text', label: 'Text → Binary', run: (s) => textToRadix(s, 2) },
  { id: 'bin-dec', group: 'Bytes as text', label: 'Binary → Text', run: (s) => radixToText(s, 2) },
  { id: 'oct-enc', group: 'Bytes as text', label: 'Text → Octal', run: (s) => textToRadix(s, 8) },
  { id: 'oct-dec', group: 'Bytes as text', label: 'Octal → Text', run: (s) => radixToText(s, 8) },
  { id: 'dec-enc', group: 'Bytes as text', label: 'Text → Decimal', run: (s) => textToRadix(s, 10) },
  { id: 'dec-dec', group: 'Bytes as text', label: 'Decimal → Text', run: (s) => radixToText(s, 10) },
  { id: 'hex-enc', group: 'Bytes as text', label: 'Text → Hex', run: (s) => textToRadix(s, 16) },
  { id: 'hex-dec', group: 'Bytes as text', label: 'Hex → Text', run: (s) => radixToText(s, 16) },
  ...caseOps,
  { id: 'slug', group: 'Case', label: 'Slugify', run: slugify },
  { id: 'reverse', group: 'Case', label: 'Reverse text', run: (s) => Array.from(s).reverse().join('') },
  ...lineOps,
]
