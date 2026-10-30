import { useEffect, useState } from 'react'
import { CopyButton, DropZone, ErrorBox, Panel, ProgressBar, Tabs } from '../components/ui'
import {
  HASH_ALGOS, formatBytes, formatDuration, formatSpeed, hashBlob, hashBytes, hmacHex, type HashAlgo, type HmacAlgo,
  type Progress,
} from '../lib'

type Source = 'text' | 'file'
const HMAC_ALGOS: HmacAlgo[] = ['SHA-256', 'SHA-1', 'SHA-384', 'SHA-512']

export default function HashTool() {
  const [source, setSource] = useState<Source>('text')
  const [text, setText] = useState('hello world')
  const [file, setFile] = useState<File | null>(null)
  const [algos, setAlgos] = useState<HashAlgo[]>(['MD5', 'SHA-1', 'SHA-256', 'CRC32'])
  const [upper, setUpper] = useState(false)
  const [compare, setCompare] = useState('')
  const [useHmac, setUseHmac] = useState(false)
  const [hmacKey, setHmacKey] = useState('')
  const [hmacAlgo, setHmacAlgo] = useState<HmacAlgo>('SHA-256')

  const [rows, setRows] = useState<[string, string][]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (source === 'file' && !file) return
    const ac = new AbortController()
    const bytes = new TextEncoder().encode(text)
    const compute = async () => {
      setBusy(true)
      setError(null)
      setProgress(null)
      try {
        const ordered = HASH_ALGOS.filter((a) => algos.includes(a))
        const res = file && source === 'file'
          ? await hashBlob(file, ordered, { signal: ac.signal, onProgress: setProgress })
          : await hashBytes(bytes, ordered)
        const out: [string, string][] = ordered.map((a) => [a, res[a]])
        if (useHmac && source === 'text') {
          out.push([`HMAC-${hmacAlgo}`, hmacKey ? await hmacHex(hmacAlgo, new TextEncoder().encode(hmacKey), bytes) : '(enter a key)'])
        }
        if (!ac.signal.aborted) setRows(out)
      } catch (e) {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!ac.signal.aborted) setBusy(false)
      }
    }
    void compute()
    return () => ac.abort()
  }, [source, text, file, algos, useHmac, hmacKey, hmacAlgo])

  const visibleRows = source === 'file' && !file ? [] : rows
  const show = (h: string) => (upper ? h.toUpperCase() : h)
  const cmp = compare.trim().toLowerCase()

  return (
    <div className="stack">
      <Panel title="Input" actions={<Tabs<Source> value={source} onChange={setSource} options={[{ id: 'text', label: 'Text' }, { id: 'file', label: 'File' }]} />}>
        {source === 'text' ? (
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Text to hash (UTF-8)…" spellCheck={false} />
        ) : file ? (
          <div className="filebox">
            <strong>{file.name}</strong>
            <span className="muted">{formatBytes(file.size)}</span>
            <button type="button" onClick={() => setFile(null)}>Choose another</button>
          </div>
        ) : (
          <DropZone onFile={setFile} hint="hashed in your browser, never uploaded" />
        )}
        <div className="row">
          {HASH_ALGOS.map((a) => (
            <label key={a} className="check">
              <input
                type="checkbox"
                checked={algos.includes(a)}
                onChange={(e) => setAlgos((cur) => (e.target.checked ? [...cur, a] : cur.filter((x) => x !== a)))}
              />
              {a}
            </label>
          ))}
          <label className="check"><input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} /> UPPERCASE</label>
        </div>
        {source === 'text' && (
          <div className="row">
            <label className="check"><input type="checkbox" checked={useHmac} onChange={(e) => setUseHmac(e.target.checked)} /> HMAC</label>
            {useHmac && (
              <>
                <select value={hmacAlgo} onChange={(e) => setHmacAlgo(e.target.value as HmacAlgo)} aria-label="HMAC hash">
                  {HMAC_ALGOS.map((a) => <option key={a}>{a}</option>)}
                </select>
                <input type="text" className="secret" placeholder="Secret key" value={hmacKey} onChange={(e) => setHmacKey(e.target.value)} />
              </>
            )}
          </div>
        )}
        {busy && source === 'file' && (
          <ProgressBar
            percent={progress?.percent ?? null}
            label={progress && `${formatBytes(progress.loaded)}${progress.total != null ? ` / ${formatBytes(progress.total)}` : ''} · ${formatSpeed(progress.speed)} · ETA ${formatDuration(progress.eta)}`}
          />
        )}
      </Panel>

      <Panel title="Digests" actions={<CopyButton label="Copy all" text={visibleRows.map(([a, h]) => `${a}: ${show(h)}`).join('\n')} />}>
        {error && <ErrorBox>{error}</ErrorBox>}
        {visibleRows.length === 0 && !error && <p className="muted">{source === 'file' ? 'Drop a file to hash it.' : 'Select at least one algorithm.'}</p>}
        <table className="kv hashes">
          <tbody>
            {visibleRows.map(([a, h]) => (
              <tr key={a}>
                <th scope="row">{a}</th>
                <td><code className="break">{show(h)}</code></td>
                <td className="actions">
                  {cmp && (h.toLowerCase() === cmp ? <span className="ok">✔ match</span> : null)}
                  <CopyButton text={show(h)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="check wide-label">
          Compare with expected hash
          <input type="text" className="wide" placeholder="Paste a checksum to verify…" value={compare} onChange={(e) => setCompare(e.target.value)} />
        </label>
        {cmp && visibleRows.length > 0 && !visibleRows.some(([, h]) => h.toLowerCase() === cmp) && <p className="bad small">✘ No digest matches the pasted value.</p>}
        <p className="muted small">MD5 and CRC-32 are computed incrementally while the file streams in. SHA digests need the whole file in memory (Web Crypto has no incremental API). MD5 and SHA-1 are fine for checksums but not for security.</p>
      </Panel>
    </div>
  )
}
