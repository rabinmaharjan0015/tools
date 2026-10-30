import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InputPanel, type InputFile } from '../components/InputPanel'
import { OutputPanel } from '../components/OutputPanel'
import { StepEditor } from '../components/StepEditor'
import { ProgressBar } from '../components/ui'
import { formatBytes, newStep, reverseSteps, runPipeline, type CodecId, type PipelineResult, type Step } from '../lib'

const PRESETS: { name: string; steps: [CodecId, Step['mode']][] }[] = [
  { name: 'Base64 encode', steps: [['base64', 'encode']] },
  { name: 'Base64 decode', steps: [['base64', 'decode']] },
  { name: 'URL encode', steps: [['url', 'encode']] },
  { name: 'Gzip → Base64', steps: [['gzip', 'encode'], ['base64', 'encode']] },
  { name: 'Base64 → Gunzip', steps: [['base64', 'decode'], ['gzip', 'decode']] },
  { name: 'Encrypt → Base64', steps: [['aes-gcm', 'encode'], ['base64', 'encode']] },
  { name: 'Base64 → Decrypt', steps: [['base64', 'decode'], ['aes-gcm', 'decode']] },
  { name: 'SHA-256', steps: [['sha-256', 'encode']] },
]

const CHUNK_SIZES = [1, 16, 256, 4096, 16384, 65536]
const AUTO_RUN_LIMIT = 2_000_000
const PROGRESS_MIN = 256 * 1024
const encoder = new TextEncoder()

export default function PipelineTool() {
  const [text, setText] = useState('Hello, नेपाल! 🇳🇵')
  const [file, setFile] = useState<InputFile | null>(null)
  const [steps, setSteps] = useState<Step[]>(() => [newStep('base64')])
  const [chunkSize, setChunkSize] = useState(16384)
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const input = useMemo(() => file?.data ?? encoder.encode(text), [file, text])
  const auto = input.length <= AUTO_RUN_LIMIT

  const run = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)
    setProgress(0)
    try {
      const r = await runPipeline(input, steps, {
        chunkSize,
        signal: ac.signal,
        onProgress: (c, t) => {
          const pct = t ? Math.floor((c / t) * 100) : 100
          setProgress((p) => (p === pct ? p : pct))
        },
      })
      if (ac.signal.aborted) return
      setResult(r)
      setError(null)
    } catch (e) {
      if (ac.signal.aborted) return
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (abortRef.current === ac) {
        setRunning(false)
        setProgress(null)
      }
    }
  }, [input, steps, chunkSize])

  useEffect(() => {
    if (!auto) return
    const t = setTimeout(() => void run(), 200)
    return () => clearTimeout(t)
  }, [run, auto])

  const reversed = reverseSteps(steps)

  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head">
          <h2>Pipeline</h2>
          <div className="row">
            <label className="check">
              Chunk size
              <select value={chunkSize} onChange={(e) => setChunkSize(Number(e.target.value))}>
                {CHUNK_SIZES.map((n) => (
                  <option key={n} value={n}>{n >= 1024 ? `${n / 1024} KB` : `${n} B`}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!reversed || steps.length === 0}
              title={reversed ? 'Flip the order and direction of every step' : 'Hash steps are one-way'}
              onClick={() => reversed && setSteps(reversed)}
            >
              ⇄ Reverse
            </button>
            <button type="button" disabled={steps.length === 0} onClick={() => setSteps([])}>Clear steps</button>
          </div>
        </header>

        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="chip" onClick={() => setSteps(p.steps.map(([c, m]) => newStep(c, m)))}>
              {p.name}
            </button>
          ))}
        </div>

        <StepEditor steps={steps} stats={result?.stats ?? null} onChange={setSteps} />

        {running && input.length > PROGRESS_MIN && (
          <ProgressBar percent={progress} label={`Streaming ${formatBytes(input.length)} through ${steps.length} step${steps.length === 1 ? '' : 's'}… ${progress ?? 0}%`} />
        )}
        {!auto && (
          <div className="row">
            <button type="button" className="primary" onClick={() => void run()} disabled={running}>
              {running ? 'Running…' : 'Run pipeline'}
            </button>
            <span className="muted small">Large input: auto-run is off.</span>
          </div>
        )}
      </section>

      <div className="cols">
        <InputPanel text={text} file={file} onText={setText} onFile={setFile} />
        <OutputPanel
          result={result}
          error={error}
          running={running}
          onUseAsInput={(bytes, asText) => {
            if (asText !== null) {
              setFile(null)
              setText(asText)
            } else {
              setFile({ name: 'previous-output.bin', data: bytes })
            }
          }}
        />
      </div>
    </div>
  )
}
