import { useMemo, useState } from 'react'
import { BlobPreview } from '../components/BlobPreview'
import { CopyButton, DropZone, ErrorBox, KV, Panel, Tabs } from '../components/ui'
import {
  base64ToBytes, bytesToBase64, bytesToBlob, canPreview, clip, decodeUtf8Strict, extensionForMime, formatBytes, hexDump, parseDataURL,
  saveBlob, sniffType,
} from '../lib'

type Dir = 'encode' | 'decode'
interface LoadedFile { name: string; bytes: Uint8Array; type: string }

export default function Base64Tool() {
  const [dir, setDir] = useState<Dir>('encode')
  const [text, setText] = useState('Hello, नेपाल! 🇳🇵')
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [urlSafe, setUrlSafe] = useState(false)
  const [pad, setPad] = useState(true)
  const [wrap, setWrap] = useState(0)
  const [asDataUrl, setAsDataUrl] = useState(false)

  const result = useMemo(() => {
    try {
      if (dir === 'encode') {
        const bytes = file ? file.bytes : new TextEncoder().encode(text)
        let out = bytesToBase64(bytes, { urlSafe, pad, wrap })
        if (asDataUrl) {
          const mime = file?.type || sniffType(bytes)?.mime || (file ? 'application/octet-stream' : 'text/plain;charset=utf-8')
          out = `data:${mime};base64,${out}`
        }
        return { kind: 'encoded' as const, out }
      }
      const source = file ? new TextDecoder().decode(file.bytes) : text
      const du = source.trim().startsWith('data:') ? parseDataURL(source) : null
      const bytes = du ? du.bytes : base64ToBytes(source)
      return { kind: 'decoded' as const, bytes, mime: du?.mime }
    } catch (e) {
      return { kind: 'error' as const, message: e instanceof Error ? e.message : String(e) }
    }
  }, [dir, text, file, urlSafe, pad, wrap, asDataUrl])

  const load = async (f: File) =>
    setFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), type: f.type })

  const decodedText = result.kind === 'decoded' ? decodeUtf8Strict(result.bytes) : null
  const detected = result.kind === 'decoded' ? sniffType(result.bytes) : null
  const mime = result.kind === 'decoded' ? (result.mime && result.mime !== 'text/plain' ? result.mime : detected?.mime ?? result.mime ?? 'application/octet-stream') : ''
  const blob = useMemo(() => (result.kind === 'decoded' ? bytesToBlob(result.bytes, mime) : null), [result, mime])

  return (
    <div className="stack">
      <Panel
        title="Options"
        actions={
          <Tabs<Dir>
            value={dir}
            onChange={setDir}
            options={[{ id: 'encode', label: 'Encode' }, { id: 'decode', label: 'Decode' }]}
          />
        }
      >
        <div className="row">
          {dir === 'encode' ? (
            <>
              <label className="check"><input type="checkbox" checked={urlSafe} onChange={(e) => { setUrlSafe(e.target.checked); setPad(!e.target.checked) }} /> URL-safe (-_)</label>
              <label className="check"><input type="checkbox" checked={pad} onChange={(e) => setPad(e.target.checked)} /> Padding (=)</label>
              <label className="check"><input type="checkbox" checked={asDataUrl} onChange={(e) => setAsDataUrl(e.target.checked)} /> As data URL</label>
              <label className="check">
                Line wrap
                <select value={wrap} onChange={(e) => setWrap(Number(e.target.value))}>
                  <option value={0}>None</option>
                  <option value={64}>64 (PEM)</option>
                  <option value={76}>76 (MIME)</option>
                </select>
              </label>
            </>
          ) : (
            <span className="muted small">Accepts standard and URL-safe Base64, with or without padding, whitespace, and data: URLs.</span>
          )}
        </div>
      </Panel>

      <div className="cols">
        <Panel
          title={dir === 'encode' ? 'Input (text or file)' : 'Base64 input'}
          actions={file && <button type="button" onClick={() => setFile(null)}>Back to text</button>}
        >
          {file ? (
            <div className="filebox">
              <strong>{file.name}</strong>
              <span className="muted">{formatBytes(file.bytes.length)}</span>
            </div>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={dir === 'encode' ? 'Type or paste text…' : 'Paste Base64 or a data: URL…'}
                spellCheck={false}
              />
              <DropZone onFile={(f) => void load(f)} hint={dir === 'decode' ? 'a file containing Base64' : undefined} />
            </>
          )}
        </Panel>

        <Panel
          title="Output"
          actions={
            result.kind === 'encoded' ? (
              <>
                <CopyButton text={result.out} />
                <button type="button" onClick={() => saveBlob(new Blob([result.out], { type: 'text/plain' }), 'base64.txt')}>Download .txt</button>
                <button type="button" onClick={() => { setText(result.out); setFile(null); setDir('decode') }}>Decode this</button>
              </>
            ) : result.kind === 'decoded' && blob ? (
              <>
                <CopyButton text={decodedText ?? ''} disabled={decodedText === null} />
                <button type="button" onClick={() => saveBlob(blob, `decoded.${detected?.ext ?? extensionForMime(mime)}`)}>Download</button>
                {decodedText !== null && (
                  <button type="button" onClick={() => { setText(decodedText); setFile(null); setDir('encode') }}>Encode this</button>
                )}
              </>
            ) : null
          }
        >
          {result.kind === 'error' && <ErrorBox>{result.message}</ErrorBox>}
          {result.kind === 'encoded' && (
            <>
              <textarea readOnly value={clip(result.out)} spellCheck={false} />
              <p className="muted small">{result.out.length.toLocaleString()} characters{result.out.length > 200_000 && ' · display truncated; copy and download use the full text'}</p>
            </>
          )}
          {result.kind === 'decoded' && blob && (
            <>
              <textarea
                readOnly
                className={decodedText === null ? 'mono' : ''}
                value={decodedText !== null ? clip(decodedText) : hexDump(result.bytes, 1024)}
                spellCheck={false}
              />
              <KV rows={[
                ['Size', formatBytes(result.bytes.length)],
                ['Content', decodedText !== null ? 'UTF-8 text' : 'Binary data (hex dump shown)'],
                ['Detected type', detected ? `${detected.label} (${detected.mime})` : result.mime ?? 'unknown'],
              ]} />
              {canPreview(mime) && <BlobPreview blob={blob} mime={mime} />}
            </>
          )}
        </Panel>
      </div>
    </div>
  )
}
