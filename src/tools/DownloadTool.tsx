import { useEffect, useRef, useState } from 'react'
import { BlobPreview } from '../components/BlobPreview'
import { ErrorBox, ProgressBar } from '../components/ui'
import {
  canPreview, createHasher, downloadStream, downloadWithProgress, formatBytes, formatDuration, formatSpeed, hashTap, saveBlob,
  simulatedSource, sniffType, type Progress,
} from '../lib'

type HashChoice = 'none' | 'CRC32' | 'MD5'
interface Job {
  id: number
  kind: 'url' | 'sim'
  label: string
  url?: string
  sizeMB: number
  kbps: number
  hash: HashChoice
}
type Status = 'downloading' | 'done' | 'error' | 'cancelled'
interface Done { blob: Blob; filename: string; hash: string | null; type: string }

let nextId = 1

export default function DownloadTool() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [mode, setMode] = useState<'url' | 'sim'>('sim')
  const [url, setUrl] = useState('')
  const [sizeMB, setSizeMB] = useState(8)
  const [kbps, setKbps] = useState(1024)
  const [hash, setHash] = useState<HashChoice>('CRC32')

  const add = () => {
    if (mode === 'url' && !url.trim()) return
    const label = mode === 'url' ? url.trim() : `Simulated ${sizeMB} MB @ ${kbps ? formatBytes(kbps * 1024) + '/s' : 'max speed'}`
    setJobs((j) => [{ id: nextId++, kind: mode, label, url: url.trim(), sizeMB, kbps, hash }, ...j])
  }

  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head">
          <h2>New download</h2>
          <div className="seg">
            <button type="button" className={mode === 'sim' ? 'on' : ''} onClick={() => setMode('sim')}>Simulated</button>
            <button type="button" className={mode === 'url' ? 'on' : ''} onClick={() => setMode('url')}>From URL</button>
          </div>
        </header>

        {mode === 'url' ? (
          <>
            <input
              type="url"
              className="wide"
              placeholder="https://example.com/file.zip"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <p className="muted small">The server has to allow cross-origin requests (CORS), otherwise the browser blocks reading the response. Same-origin files and public CDNs work.</p>
          </>
        ) : (
          <div className="row">
            <label className="check">
              Size
              <select value={sizeMB} onChange={(e) => setSizeMB(Number(e.target.value))}>
                {[1, 4, 8, 32, 128].map((n) => <option key={n} value={n}>{n} MB</option>)}
              </select>
            </label>
            <label className="check">
              Speed
              <select value={kbps} onChange={(e) => setKbps(Number(e.target.value))}>
                <option value={128}>128 KB/s</option>
                <option value={512}>512 KB/s</option>
                <option value={1024}>1 MB/s</option>
                <option value={4096}>4 MB/s</option>
                <option value={0}>Max</option>
              </select>
            </label>
            <span className="muted small">Generates pseudo-random bytes locally, so you can try progress, cancel and hashing offline.</span>
          </div>
        )}

        <div className="row">
          <label className="check">
            Checksum while downloading
            <select value={hash} onChange={(e) => setHash(e.target.value as HashChoice)}>
              <option value="none">None</option>
              <option value="CRC32">CRC-32</option>
              <option value="MD5">MD5</option>
            </select>
          </label>
          <button type="button" className="primary" onClick={add}>Start download</button>
          {jobs.length > 0 && <button type="button" onClick={() => setJobs([])}>Clear all</button>}
        </div>
      </section>

      {jobs.length === 0 && <p className="muted">Downloads you start appear here, each with its own progress bar. You can run several at once.</p>}
      {jobs.map((job) => (
        <DownloadItem key={job.id} job={job} onRemove={() => setJobs((j) => j.filter((x) => x.id !== job.id))} />
      ))}
    </div>
  )
}

function DownloadItem({ job, onRemove }: { job: Job; onRemove: () => void }) {
  const [status, setStatus] = useState<Status>('downloading')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const acRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    acRef.current = ac
    const run = async () => {
      try {
        const hasher = job.hash === 'none' ? null : createHasher(job.hash)
        const taps = hasher ? [hashTap(hasher)] : []
        let blob: Blob
        let filename: string
        if (job.kind === 'url') {
          const r = await downloadWithProgress(job.url ?? '', { signal: ac.signal, onProgress: setProgress, taps })
          blob = r.blob
          filename = r.filename
        } else {
          const total = job.sizeMB * 1024 * 1024
          blob = await downloadStream(simulatedSource(total, job.kbps * 1024), { signal: ac.signal, total, onProgress: setProgress, taps })
          filename = `simulated-${job.sizeMB}MB.bin`
        }
        if (ac.signal.aborted) return
        const detected = blob.type ? null : sniffType(new Uint8Array(await blob.slice(0, 4096).arrayBuffer()))
        setDone({ blob, filename, hash: hasher ? await hasher.digest() : null, type: blob.type || detected?.mime || '' })
        setStatus('done')
      } catch (e) {
        if (ac.signal.aborted) return
        const msg = e instanceof Error ? e.message : String(e)
        setError(e instanceof TypeError ? `${msg}. This is usually a CORS block or a network problem.` : msg)
        setStatus('error')
      }
    }
    void run()
    return () => ac.abort()
  }, [job, attempt])

  const retry = () => {
    setStatus('downloading')
    setProgress(null)
    setDone(null)
    setError(null)
    setAttempt((a) => a + 1)
  }

  const cancel = () => {
    acRef.current?.abort()
    setStatus('cancelled')
  }

  const pct = progress?.percent ?? null
  return (
    <section className="panel">
      <header className="panel-head">
        <h2 className="ellipsis" title={job.label}>{job.label}</h2>
        <div className="row">
          {status === 'downloading' && <button type="button" onClick={cancel}>Cancel</button>}
          {(status === 'error' || status === 'cancelled') && <button type="button" onClick={retry}>Retry</button>}
          {done && <button type="button" className="primary" onClick={() => saveBlob(done.blob, done.filename)}>Save {formatBytes(done.blob.size)}</button>}
          <button type="button" aria-label="Remove" onClick={onRemove}>✕</button>
        </div>
      </header>

      <ProgressBar
        percent={status === 'done' ? 100 : status === 'downloading' ? pct : (pct ?? 0)}
        tone={status === 'error' ? 'error' : status === 'done' ? 'ok' : undefined}
        label={
          <span className="progress-stats">
            <strong>{status === 'downloading' ? (pct != null ? `${pct.toFixed(1)}%` : 'Downloading…') : status === 'done' ? 'Complete' : status === 'cancelled' ? 'Cancelled' : 'Failed'}</strong>
            {progress && (
              <>
                <span>{formatBytes(progress.loaded)}{progress.total != null && ` / ${formatBytes(progress.total)}`}</span>
                {status === 'downloading' && <span>{formatSpeed(progress.speed)}</span>}
                {status === 'downloading' && progress.eta != null && <span>ETA {formatDuration(progress.eta)}</span>}
                <span>{formatDuration(progress.elapsed)} elapsed</span>
              </>
            )}
          </span>
        }
      />

      {error && <ErrorBox>{error}</ErrorBox>}
      {done && (
        <>
          <p className="muted small">
            {done.filename}{done.type && ` · ${done.type}`}
            {done.hash && <> · {job.hash} <code>{done.hash}</code></>}
          </p>
          {canPreview(done.type) && <BlobPreview blob={done.blob} mime={done.type} />}
        </>
      )}
    </section>
  )
}
