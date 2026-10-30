import { CODEC_BY_ID, type CodecId, type StepOptions } from './registry'
import type { ByteTransform, Mode } from './types'

export interface Step {
  id: string
  codec: CodecId
  mode: Mode
  options: StepOptions
}

let stepCounter = 0
export const newStep = (codec: CodecId, mode: Mode = 'encode'): Step => ({
  id: `step-${++stepCounter}`,
  codec,
  mode,
  options: {},
})

export interface StepStat {
  bytesIn: number
  bytesOut: number
  chunksOut: number
}

export interface PipelineResult {
  output: Uint8Array
  stats: StepStat[]
  ms: number
}

/** Readable stream over a byte array, delivered in fixed-size chunks (pull based). */
export function bytesToStream(
  data: Uint8Array,
  chunkSize: number,
  onChunk?: (consumed: number) => void,
): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= data.length) return controller.close()
      controller.enqueue(data.subarray(offset, offset + chunkSize))
      offset += chunkSize
      onChunk?.(Math.min(offset, data.length))
    },
  })
}

/** Pass-through that reports how many bytes/chunks went by. */
export function counter(stat: StepStat): ByteTransform {
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      stat.bytesOut += chunk.length
      stat.chunksOut += 1
      controller.enqueue(chunk)
    },
  })
}

/** Re-slice a stream into fixed-size chunks (the last one may be smaller). */
export function rechunk(size: number): ByteTransform {
  let buf = new Uint8Array(0)
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const merged = new Uint8Array(buf.length + chunk.length)
      merged.set(buf)
      merged.set(chunk, buf.length)
      let off = 0
      while (merged.length - off >= size) {
        controller.enqueue(merged.slice(off, off + size))
        off += size
      }
      buf = merged.slice(off)
    },
    flush(controller) {
      if (buf.length) controller.enqueue(buf)
    },
  })
}

export async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

export async function runPipeline(
  input: Uint8Array,
  steps: Step[],
  opts: { chunkSize?: number; signal?: AbortSignal; onProgress?: (consumed: number, total: number) => void } = {},
): Promise<PipelineResult> {
  const t0 = performance.now()
  const stats: StepStat[] = []
  let stream = bytesToStream(
    input,
    Math.max(1, opts.chunkSize ?? 16 * 1024),
    opts.onProgress && ((n) => opts.onProgress?.(n, input.length)),
  )

  steps.forEach((step, i) => {
    const def = CODEC_BY_ID[step.codec]
    const stat: StepStat = { bytesIn: i === 0 ? input.length : stats[i - 1].bytesOut, bytesOut: 0, chunksOut: 0 }
    stats.push(stat)
    stream = stream
      .pipeThrough(def.create(step.mode, step.options), { signal: opts.signal })
      .pipeThrough(counter(stat), { signal: opts.signal })
  })

  const output = await collect(stream)
  return { output, stats, ms: performance.now() - t0 }
}

/** Convenience for one-off calls: await transform(bytes, 'base64', 'encode') */
export async function transform(
  input: Uint8Array | string,
  codec: CodecId,
  mode: Mode = 'encode',
  options: StepOptions = {},
): Promise<Uint8Array> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const { output } = await runPipeline(bytes, [{ id: 'one', codec, mode, options }])
  return output
}

/* ---------- display helpers ---------- */

export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

export function hexDump(bytes: Uint8Array, limit = 2048): string {
  const lines: string[] = []
  const end = Math.min(bytes.length, limit)
  for (let i = 0; i < end; i += 16) {
    const row = bytes.subarray(i, Math.min(i + 16, end))
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, '0')).join(' ')
    const ascii = Array.from(row, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`)
  }
  if (bytes.length > end) lines.push(`… ${bytes.length - end} more bytes`)
  return lines.join('\n')
}

/** Reverse a pipeline: flip order and direction. Returns null if any step is one-way. */
export function reverseSteps(steps: Step[]): Step[] | null {
  if (steps.some((s) => !CODEC_BY_ID[s.codec].reversible)) return null
  return [...steps].reverse().map((s) => ({ ...s, mode: s.mode === 'encode' ? 'decode' : 'encode' }))
}
