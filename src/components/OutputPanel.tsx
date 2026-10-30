import { useMemo, useState } from 'react'
import { decodeUtf8Strict, formatBytes, hexDump, type PipelineResult } from '../lib'

interface Props {
  result: PipelineResult | null
  error: string | null
  running: boolean
  onUseAsInput: (bytes: Uint8Array, text: string | null) => void
}

const SHOW_LIMIT = 200_000

export function OutputPanel({ result, error, running, onUseAsInput }: Props) {
  const [copied, setCopied] = useState(false)
  const text = useMemo(() => (result ? decodeUtf8Strict(result.output) : null), [result])

  const download = () => {
    if (!result) return
    const url = URL.createObjectURL(new Blob([result.output as BlobPart]))
    const a = document.createElement('a')
    a.href = url
    a.download = text !== null ? 'output.txt' : 'output.bin'
    a.click()
    URL.revokeObjectURL(url)
  }

  const copy = async () => {
    if (text === null) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const shown =
    !result ? '' : text === null ? hexDump(result.output) : text.length > SHOW_LIMIT ? text.slice(0, SHOW_LIMIT) : text

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Output {running && <span className="spin" aria-label="Running" />}</h2>
        <div className="row">
          <button type="button" disabled={text === null} onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
          <button type="button" disabled={!result} onClick={download}>Download</button>
          <button type="button" disabled={!result} onClick={() => result && onUseAsInput(result.output, text)}>
            Use as input
          </button>
        </div>
      </header>

      {error ? (
        <div className="error" role="alert">{error}</div>
      ) : (
        <>
          <textarea className={text === null ? 'mono' : ''} readOnly value={shown} placeholder="Result appears here" spellCheck={false} />
          {result && (
            <p className="muted small">
              {formatBytes(result.output.length)}
              {text === null && ' · binary data, showing a hex dump (download it, or add a Base64 step for text)'}
              {text !== null && text.length > SHOW_LIMIT && ` · display truncated to ${SHOW_LIMIT.toLocaleString()} characters; copy and download use the full data`}
              {' · '}{result.ms.toFixed(1)} ms
            </p>
          )}
        </>
      )}
    </section>
  )
}
