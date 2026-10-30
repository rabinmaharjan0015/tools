import { formatBytes, type ByteTransform } from './types'

/* ---------- progress tracking ---------- */

export interface Progress {
  loaded: number
  /** null when the size is unknown */
  total: number | null
  /** 0-100, or null when the size is unknown */
  percent: number | null
  /** bytes per second over a ~3 s sliding window */
  speed: number
  /** seconds remaining, null when unknown */
  eta: number | null
  /** seconds since start */
  elapsed: number
}

export function createTracker(total: number | null, onProgress?: (p: Progress) => void, minIntervalMs = 100) {
  const t0 = performance.now()
  let loaded = 0
  let lastEmit = -Infinity
  const samples: [number, number][] = [[t0, 0]]

  const snapshot = (now: number): Progress => {
    while (samples.length > 2 && now - samples[0][0] > 3000) samples.shift()
    const [t, l] = samples[0]
    const dt = (now - t) / 1000
    const speed = dt > 0 ? (loaded - l) / dt : 0
    const remaining = total != null ? Math.max(0, total - loaded) : null
    return {
      loaded,
      total,
      percent: total ? Math.min(100, (loaded / total) * 100) : null,
      speed,
      eta: remaining != null && speed > 0 ? remaining / speed : null,
      elapsed: (now - t0) / 1000,
    }
  }

  return {
    add(n: number) {
      loaded += n
      const now = performance.now()
      samples.push([now, loaded])
      if (now - lastEmit >= minIntervalMs) {
        lastEmit = now
        onProgress?.(snapshot(now))
      }
    },
    finish() {
      const p = snapshot(performance.now())
      onProgress?.({ ...p, percent: 100, eta: 0 })
    },
  }
}

export function progressStream(tracker: ReturnType<typeof createTracker>): ByteTransform {
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      tracker.add(chunk.length)
      controller.enqueue(chunk)
    },
  })
}

export const formatSpeed = (bps: number) => `${formatBytes(Math.round(bps))}/s`

export function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '–'
  if (sec < 1) return '<1s'
  const s = Math.round(sec)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/* ---------- downloading ---------- */

export interface DownloadOptions {
  total?: number | null
  onProgress?: (p: Progress) => void
  signal?: AbortSignal
  /** extra pass-through streams (e.g. hashTap) that observe bytes as they arrive */
  taps?: ByteTransform[]
  type?: string
}

/** Drain a byte stream into a Blob while reporting progress. Abortable. */
export async function downloadStream(source: ReadableStream<Uint8Array>, opts: DownloadOptions = {}): Promise<Blob> {
  const { signal } = opts
  signal?.throwIfAborted()
  const tracker = createTracker(opts.total ?? null, opts.onProgress)
  let stream = source.pipeThrough(progressStream(tracker), { signal })
  for (const tap of opts.taps ?? []) stream = stream.pipeThrough(tap, { signal })

  const reader = stream.getReader()
  const parts: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
  }
  tracker.finish()
  return new Blob(parts as BlobPart[], { type: opts.type ?? '' })
}

export interface DownloadResult {
  blob: Blob
  filename: string
  total: number | null
  mime: string
}

export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(header)
  if (star) {
    try { return decodeURIComponent(star[1].trim()) } catch { /* fall through */ }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  return plain ? plain[1].trim() : null
}

export function filenameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : 'download'
  } catch {
    return 'download'
  }
}

/** fetch() a URL as a stream, with progress, abort and optional taps. The server must allow CORS. */
export async function downloadWithProgress(
  url: string,
  opts: DownloadOptions & { init?: RequestInit } = {},
): Promise<DownloadResult> {
  const res = await fetch(url, { ...opts.init, signal: opts.signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}`)

  // content-length is the *compressed* size when content-encoding is set, but we count decoded bytes
  const encoding = res.headers.get('content-encoding')
  const len = Number(res.headers.get('content-length'))
  const total = len > 0 && (!encoding || encoding === 'identity') ? len : null
  const mime = res.headers.get('content-type')?.split(';')[0].trim() ?? ''
  const filename = filenameFromDisposition(res.headers.get('content-disposition')) ?? filenameFromUrl(res.url || url)

  const body = res.body ?? new Blob([await res.arrayBuffer()]).stream()
  const blob = await downloadStream(body as ReadableStream<Uint8Array>, { ...opts, total, type: mime })
  return { blob, filename, total, mime }
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** A fake network source: deterministic pseudo-random bytes at a fixed speed. Great for demos and tests. */
export function simulatedSource(totalBytes: number, bytesPerSecond: number, chunkSize = 16 * 1024): ReadableStream<Uint8Array> {
  let sent = 0
  let cancelled = false
  let seed = 1
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (sent >= totalBytes) return controller.close()
      const n = Math.min(chunkSize, totalBytes - sent)
      const delay = Number.isFinite(bytesPerSecond) && bytesPerSecond > 0 ? (n / bytesPerSecond) * 1000 : 0
      await new Promise((r) => setTimeout(r, delay))
      if (cancelled) return
      const chunk = new Uint8Array(n)
      for (let i = 0; i < n; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        chunk[i] = seed >>> 24
      }
      sent += n
      controller.enqueue(chunk)
    },
    cancel() {
      cancelled = true
    },
  })
}
