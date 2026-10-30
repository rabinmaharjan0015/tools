import { describe, expect, it } from 'vitest'
import {
  CASE_FNS, MD5, base64ToBytes, bytesToArrayLiteral, bytesToBase64, bytesToDataURL, bytesToHex, decodeJwt,
  describeDate, downloadStream, formatDuration, hashBytes, hashBlob, hexToBytes, hmacHex, htmlDecode, htmlEncode,
  jsonEscapeString, jsonFormat, jsonUnescapeString, nanoid, parseBigInt, parseDataURL, parseTimestamp, passwordEntropy,
  radixToText, randomPassword, runPipeline, shannonEntropy, signJwt, simulatedSource, sniffType, textStats,
  textToRadix, transform, unicodeEscape, unicodeUnescape, uuidv4, uuidv7, verifyJwtHmac, filenameFromDisposition,
  filenameFromUrl, LINE_FNS, slugify, type Progress, TEXT_OPS,
} from './index'

const enc = new TextEncoder()
const dec = new TextDecoder()
const md5 = (s: string) => { const m = new MD5(); m.update(enc.encode(s)); return m.digest() }

describe('hashing', () => {
  it('MD5 known vectors', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6')
    expect(md5('1234567890'.repeat(8))).toBe('57edf4a22be3c955ac49da2e2107b67a')
  })
  it('MD5 is chunk-boundary safe', () => {
    const data = enc.encode('x'.repeat(1000))
    const whole = new MD5(); whole.update(data)
    for (const size of [1, 7, 63, 64, 65, 200]) {
      const m = new MD5()
      for (let i = 0; i < data.length; i += size) m.update(data.subarray(i, i + size))
      expect(m.digest()).toBe(whole.digest())
    }
  })
  it('hashBytes / hashBlob match known digests', async () => {
    const r = await hashBytes(enc.encode('abc'), ['MD5', 'SHA-1', 'SHA-256', 'CRC32'])
    expect(r.MD5).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(r['SHA-1']).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(r['SHA-256']).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(r.CRC32).toBe('352441c2')
    expect((await hashBlob(new Blob(['abc']), ['MD5'])).MD5).toBe(r.MD5)
  })
  it('md5 is available as a pipeline codec', async () => {
    expect(dec.decode(await transform('abc', 'md5'))).toBe('900150983cd24fb0d6963f7d28e17f72')
  })
  it('HMAC-SHA256 known vector', async () => {
    expect(await hmacHex('SHA-256', enc.encode('key'), enc.encode('The quick brown fox jumps over the lazy dog'))).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    )
  })
})

describe('base64 / data URL / hex', () => {
  const bytes = Uint8Array.from([251, 255, 0, 1, 2, 250])
  it('round trips standard, url-safe and wrapped', () => {
    expect(bytesToBase64(bytes)).toBe('+/8AAQL6')
    expect(bytesToBase64(bytes, { urlSafe: true })).toBe('-_8AAQL6')
    expect(base64ToBytes('-_8AAQL6')).toEqual(bytes)
    expect(base64ToBytes('+/8AAQL6')).toEqual(bytes)
    const big = new Uint8Array(100_000).map((_, i) => i % 256)
    expect(base64ToBytes(bytesToBase64(big, { wrap: 76 }))).toEqual(big)
    expect(bytesToBase64(enc.encode('hello'), { urlSafe: true })).toBe('aGVsbG8')
    expect(bytesToBase64(enc.encode('hello'), { wrap: 4 })).toBe('aGVs\nbG8=')
  })
  it('rejects invalid base64', () => {
    expect(() => base64ToBytes('@@@')).toThrow(/Invalid Base64/)
    expect(() => base64ToBytes('A')).toThrow(/length/)
  })
  it('data URLs', () => {
    const url = bytesToDataURL(enc.encode('hi'), 'text/plain')
    expect(url).toBe('data:text/plain;base64,aGk=')
    expect(parseDataURL(url)).toMatchObject({ mime: 'text/plain', base64: true })
    expect(dec.decode(parseDataURL('data:text/plain;charset=utf-8;base64,aGk=')!.bytes)).toBe('hi')
    expect(dec.decode(parseDataURL('data:,Hello%20World')!.bytes)).toBe('Hello World')
    expect(parseDataURL('nope')).toBeNull()
  })
  it('hex and array literal', () => {
    expect(bytesToHex(Uint8Array.of(0, 15, 255), ' ')).toBe('00 0f ff')
    expect(hexToBytes('0x00, 0F:ff')).toEqual(Uint8Array.of(0, 15, 255))
    expect(() => hexToBytes('abc')).toThrow(/odd/)
    expect(bytesToArrayLiteral(Uint8Array.of(1, 2, 3))).toBe('new Uint8Array([1, 2, 3])')
  })
})

describe('sniffing', () => {
  const b = (...n: number[]) => Uint8Array.from(n)
  it('detects common formats', () => {
    expect(sniffType(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))?.ext).toBe('png')
    expect(sniffType(b(0x1f, 0x8b, 0x08, 0))?.ext).toBe('gz')
    expect(sniffType(enc.encode('%PDF-1.7'))?.ext).toBe('pdf')
    expect(sniffType(enc.encode('RIFF\0\0\0\0WEBPVP8 '))?.ext).toBe('webp')
    expect(sniffType(b(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d))?.ext).toBe('mp4')
    expect(sniffType(enc.encode('{"a":1}'))?.ext).toBe('json')
    expect(sniffType(enc.encode('hello world'))?.ext).toBe('txt')
    expect(sniffType(b(1, 2, 3, 4, 5))).toBeNull()
  })
  it('entropy', () => {
    expect(shannonEntropy(new Uint8Array(100))).toBe(0)
    expect(shannonEntropy(Uint8Array.from({ length: 256 }, (_, i) => i))).toBeCloseTo(8)
  })
})

describe('download with progress', () => {
  it('reports progress to 100% and builds the blob', async () => {
    const events: Progress[] = []
    const blob = await downloadStream(simulatedSource(100_000, Infinity, 10_000), {
      total: 100_000,
      onProgress: (p) => events.push(p),
    })
    expect(blob.size).toBe(100_000)
    const last = events[events.length - 1]
    expect(last.loaded).toBe(100_000)
    expect(last.percent).toBe(100)
    expect(events.every((e, i) => i === 0 || e.loaded >= events[i - 1].loaded)).toBe(true)
  })
  it('is deterministic and abortable', async () => {
    const a = await new Response(simulatedSource(5000, Infinity)).arrayBuffer()
    const b = await new Response(simulatedSource(5000, Infinity)).arrayBuffer()
    expect(new Uint8Array(a)).toEqual(new Uint8Array(b))

    const ac = new AbortController()
    const p = downloadStream(simulatedSource(1_000_000, 1000), { signal: ac.signal })
    setTimeout(() => ac.abort(), 20)
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('helpers', () => {
    expect(formatDuration(0.2)).toBe('<1s')
    expect(formatDuration(75)).toBe('1m 15s')
    expect(formatDuration(null)).toBe('–')
    expect(filenameFromDisposition(`attachment; filename="a b.txt"`)).toBe('a b.txt')
    expect(filenameFromDisposition(`attachment; filename*=UTF-8''na%C3%AFve.txt`)).toBe('naïve.txt')
    expect(filenameFromUrl('https://x.test/path/file%20one.zip?x=1')).toBe('file one.zip')
  })
  it('pipeline onProgress', async () => {
    const calls: [number, number][] = []
    await runPipeline(new Uint8Array(1000), [], { chunkSize: 300, onProgress: (c, t) => calls.push([c, t]) })
    expect(calls[calls.length - 1]).toEqual([1000, 1000])
  })
})

describe('jwt', () => {
  const TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
  it('decodes and verifies the jwt.io sample', async () => {
    const j = decodeJwt(`Bearer ${TOKEN}`)
    expect(j.header.alg).toBe('HS256')
    expect(j.payload.name).toBe('John Doe')
    expect(await verifyJwtHmac(TOKEN, 'your-256-bit-secret')).toBe(true)
    expect(await verifyJwtHmac(TOKEN, 'wrong')).toBe(false)
  })
  it('signs and verifies, all HS algorithms', async () => {
    for (const alg of ['HS256', 'HS384', 'HS512']) {
      const t = await signJwt({ sub: 'ü', n: 1 }, 's3cret', alg)
      expect(await verifyJwtHmac(t, 's3cret')).toBe(true)
      expect(decodeJwt(t).payload.sub).toBe('ü')
    }
    await expect(signJwt({}, 'k', 'RS256')).rejects.toThrow(/Only HS256/)
  })
  it('rejects garbage', () => {
    expect(() => decodeJwt('a.b')).toThrow()
    expect(() => decodeJwt('YQ.YQ.YQ')).toThrow(/valid JSON/)
  })
})

describe('text tools', () => {
  it('html entities', () => {
    expect(htmlEncode(`<a href="x">&</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
    expect(htmlEncode('é😀', true)).toBe('&#233;&#128512;')
    expect(htmlDecode('&lt;b&gt; &amp; &#233; &#x1F600; &copy; &bogus; &#0;')).toBe('<b> & é 😀 © &bogus; &#0;')
  })
  it('unicode escapes', () => {
    expect(unicodeEscape('aé😀')).toBe('a\\u00e9\\u{1f600}')
    expect(unicodeUnescape('a\\u00e9\\u{1f600}\\x41\\ud83d\\ude00')).toBe('aé😀A😀')
  })
  it('bytes as text', () => {
    expect(textToRadix('Hi', 2)).toBe('01001000 01101001')
    expect(radixToText('0100100001101001', 2)).toBe('Hi')
    expect(radixToText(textToRadix('नेपाल', 8), 8)).toBe('नेपाल')
    expect(radixToText(textToRadix('ok', 10), 10)).toBe('ok')
    expect(radixToText('48 69', 16)).toBe('Hi')
    expect(() => radixToText('12', 2)).toThrow(/not a valid/)
    expect(() => radixToText('300', 10)).toThrow(/larger/)
  })
  it('case conversion', () => {
    const s = 'helloWorld XMLHttpRequest foo_bar'
    expect(CASE_FNS.snake_case(s)).toBe('hello_world_xml_http_request_foo_bar')
    expect(CASE_FNS.camelCase('Hello big-world')).toBe('helloBigWorld')
    expect(CASE_FNS.PascalCase('hello big-world')).toBe('HelloBigWorld')
    expect(CASE_FNS['kebab-case']('Hello World\nFoo Bar')).toBe('hello-world\nfoo-bar')
    expect(CASE_FNS['Title Case']("it's a test")).toBe("It's A Test")
    expect(slugify('Héllo, Wörld!  ')).toBe('hello-world')
  })
  it('line tools and stats', () => {
    expect(LINE_FNS['Sort A → Z'](['b10', 'b2', 'a'])).toEqual(['a', 'b2', 'b10'])
    expect(LINE_FNS['Remove duplicates'](['a', 'b', 'a'])).toEqual(['a', 'b'])
    expect(LINE_FNS.Shuffle(['a', 'b', 'c', 'd']).sort()).toEqual(['a', 'b', 'c', 'd'])
    const s = textStats('Hello  world\n\nbye')
    expect(s.Words).toBe(3)
    expect(s.Lines).toBe(3)
    expect(s.Paragraphs).toBe(2)
  })
  it('every TEXT_OP has a unique id', () => {
    const ids = TEXT_OPS.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('json', () => {
    expect(jsonFormat('{"b":1,"a":[2]}', 2, true)).toBe('{\n  "a": [\n    2\n  ],\n  "b": 1\n}')
    expect(() => jsonFormat('{oops}')).toThrow()
    expect(jsonUnescapeString(jsonEscapeString('a"b\n\tü'))).toBe('a"b\n\tü')
  })
})

describe('generators', () => {
  it('uuids', () => {
    expect(uuidv4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const a = uuidv7(1_700_000_000_000)
    const b = uuidv7(1_700_000_000_001)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a.slice(0, 13) < b.slice(0, 13)).toBe(true)
    expect(a.replace('-', '').slice(0, 11)).toBe((1_700_000_000_000).toString(16).padStart(12, '0').slice(0, 11))
  })
  it('nanoid and passwords', () => {
    expect(nanoid(30)).toMatch(/^[\w-]{30}$/)
    const o = { length: 24, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: true }
    for (let i = 0; i < 50; i++) {
      const p = randomPassword(o)
      expect(p).toHaveLength(24)
      expect(p).toMatch(/[a-z]/); expect(p).toMatch(/[A-Z]/); expect(p).toMatch(/\d/); expect(p).toMatch(/[^\w]|_/)
      expect(p).not.toMatch(/[Il1O0o|]/)
    }
    expect(passwordEntropy(o)).toBeGreaterThan(120)
    expect(() => randomPassword({ ...o, lower: false, upper: false, digits: false, symbols: false })).toThrow()
    expect(() => randomPassword({ ...o, length: 2 })).toThrow()
  })
})

describe('time and numbers', () => {
  it('parses timestamps in s / ms / ISO', () => {
    expect(parseTimestamp('1700000000')?.toISOString()).toBe('2023-11-14T22:13:20.000Z')
    expect(parseTimestamp('1700000000000')?.toISOString()).toBe('2023-11-14T22:13:20.000Z')
    expect(parseTimestamp('2023-11-14T22:13:20Z')?.getTime()).toBe(1_700_000_000_000)
    expect(parseTimestamp('nonsense')).toBeNull()
    expect(describeDate(new Date(0))[3]).toEqual(['Unix (seconds)', '0'])
  })
  it('converts bases with BigInt', () => {
    expect(parseBigInt('0xff', 16)).toBe(255n)
    expect(parseBigInt('-1010', 2)).toBe(-10n)
    expect(parseBigInt('ffffffffffffffffffff', 16).toString(10)).toBe('1208925819614629174706175')
    expect(() => parseBigInt('12', 2)).toThrow(/not a valid/)
  })
})
