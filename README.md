# Stream Tools

A Vite + React + TypeScript toolkit built on **Web Streams**. Everything runs in the browser; nothing is uploaded.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 93 tests (Vitest)
npm run build
```

## Tools

| Tool | What it does |
| --- | --- |
| **Stream Pipeline** | Chain Base64, Base64URL, Base32, hex, URL encoding, gzip/deflate, AES-256-GCM, XOR, ROT13, MD5, SHA and CRC-32 as streams. Per-step byte and chunk stats, reverse button, progress bar for big inputs. |
| **Base64** | Text and files, standard or URL-safe, padding and line-wrap options, data: URLs, image/audio/video/PDF preview of decoded output. |
| **Blob Converter** | File to Base64 / data URL / text / hex / `Uint8Array` / object URL. Build a Blob from Base64, a data URL, hex or text, with preview and download. Convert images between PNG, JPEG and WebP with quality and resize. |
| **Download Manager** | Live progress bar with percent, bytes, speed, ETA and elapsed time. Several downloads at once, cancel and retry, streaming CRC-32 or MD5 while bytes arrive. Real URLs (needs CORS) or a simulated source for offline demos. |
| **Hash & Checksum** | MD5, SHA-1/256/384/512, CRC-32 and HMAC for text and files, progress bar, and a paste-to-verify box. |
| **File Inspector** | Real file type from magic bytes, wrong-extension warning, entropy, hex dump, hashes. |
| **JWT** | Decode, show expiry, verify HS256/384/512 signatures, create signed tokens. |
| **JSON** | Validate, format, minify, sort keys, escape and unescape strings. |
| **URL** | Parse into parts, edit query parameters, compare percent-encodings. |
| **Text Tools** | HTML entities, Unicode escapes, text as binary/octal/decimal/hex, case conversion, slugify, line tools, stats. |
| **Time & Numbers** | Unix timestamps (s/ms/µs/ns) and BigInt number-base conversion. |
| **Generators** | UUID v4/v7, passwords (unbiased, with entropy estimate), Nano ID, random keys. |

Tools stay mounted after you open them, so a running download survives switching tabs. Each tool has a link such as `#download`.

## Library (`src/lib`, no React)

```ts
import {
  transform, runPipeline, downloadWithProgress, downloadStream, simulatedSource, hashTap, createHasher,
  hashBlob, bytesToBase64, base64ToBytes, blobToDataURL, parseDataURL, sniffType, convertImage,
} from './lib'

// stream any codec
const b64 = await transform('hello', 'base64')

// download with progress, cancel and a live checksum
const hasher = createHasher('MD5')
const ac = new AbortController()
const { blob, filename } = await downloadWithProgress('/big.zip', {
  signal: ac.signal,
  taps: [hashTap(hasher)],
  onProgress: ({ percent, speed, eta }) => console.log(percent, speed, eta),
})
console.log(await hasher.digest())

// hash a File with progress, without loading it all at once (MD5 and CRC-32)
await hashBlob(file, ['MD5', 'SHA-256'], { onProgress: (p) => console.log(p.percent) })
```

| File | Contents |
| --- | --- |
| `bits.ts`, `simple.ts` | Base64/Base32/hex codecs, percent encoding, ROT13, XOR, CRC-32 |
| `crypto.ts` | SHA digests, chunked AES-256-GCM |
| `md5.ts`, `hash.ts` | Incremental MD5, hashers, `hashBlob`, HMAC |
| `download.ts` | Progress tracker (speed, ETA), `downloadStream`, `downloadWithProgress`, `simulatedSource`, `saveBlob` |
| `blob.ts` | Blob/Base64/data URL/hex conversions, magic-number sniffing, entropy, image conversion |
| `jwt.ts`, `json.ts`, `text.ts`, `convert.ts`, `generate.ts` | The developer tools |
| `registry.ts`, `pipeline.ts` | Codec table and `runPipeline` |

## Notes

- **CORS:** downloading from another origin needs the server to send CORS headers. This is a browser rule.
- **Progress totals:** when a server compresses the response (`Content-Encoding`), `Content-Length` is the compressed size, so the percent is hidden rather than wrong.
- **SHA digests buffer** the input (Web Crypto has no incremental API). MD5 and CRC-32 are truly incremental.
- **AES-GCM format** is custom (`salt | frames`, each frame authenticated with its index and a final flag), so other tools cannot read it. Its output is binary: add Base64 after it for text.
- XOR and ROT13 are obfuscation, not security. MD5 and SHA-1 are for checksums only.
- Brotli is not available in browsers.
