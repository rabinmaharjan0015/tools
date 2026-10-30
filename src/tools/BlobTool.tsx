import { useEffect, useMemo, useState } from 'react'
import { BlobPreview } from '../components/BlobPreview'
import { CopyButton, DropZone, ErrorBox, KV, Panel, Tabs } from '../components/ui'
import {
  base64ToBytes, blobToBase64, blobToDataURL, canPreview, clip, bytesToArrayLiteral, bytesToBlob, bytesToHex, convertImage,
  extensionForMime, formatBytes, hexToBytes, parseDataURL, saveBlob, sniffType, type DetectedType, type ImageFormat,
} from '../lib'

type Section = 'from' | 'to'
type Format = 'base64' | 'dataurl' | 'text' | 'hex' | 'array' | 'objecturl'

const FORMATS: { id: Format; label: string }[] = [
  { id: 'base64', label: 'Base64' },
  { id: 'dataurl', label: 'Data URL' },
  { id: 'text', label: 'Text (UTF-8)' },
  { id: 'hex', label: 'Hex' },
  { id: 'array', label: 'Uint8Array' },
  { id: 'objecturl', label: 'Object URL' },
]
const PREVIEW_BYTES = 64 * 1024

export default function BlobTool() {
  const [section, setSection] = useState<Section>('from')
  return (
    <div className="stack">
      <Tabs<Section>
        value={section}
        onChange={setSection}
        options={[{ id: 'from', label: 'Convert a file / blob' }, { id: 'to', label: 'Build a blob from data' }]}
      />
      {section === 'from' ? <FromFile /> : <ToBlob />}
    </div>
  )
}

/* ---------------- file -> formats ---------------- */

function FromFile() {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<Format>('base64')
  const [detected, setDetected] = useState<DetectedType | null>(null)
  const [res, setRes] = useState<{ key: string; out: string; note: string; error: string | null } | null>(null)

  useEffect(() => {
    if (!file) return
    let live = true
    void file.slice(0, 4096).arrayBuffer().then((b) => live && setDetected(sniffType(new Uint8Array(b))))
    return () => { live = false }
  }, [file])

  const key = file ? `${file.name}:${file.size}:${file.lastModified}:${format}:${detected?.mime ?? ''}` : ''
  const ready = res?.key === key ? res : null
  const busy = !!file && !ready

  useEffect(() => {
    if (!file) return
    let live = true
    let objectUrl: string | null = null
    ;(async () => {
      const typed = file.type ? file : file.slice(0, file.size, detected?.mime ?? '')
      let text = ''
      let note = ''
      switch (format) {
        case 'base64': text = await blobToBase64(file); break
        case 'dataurl': text = await blobToDataURL(typed); break
        case 'text':
          text = await file.slice(0, 1_000_000).text()
          if (file.size > 1_000_000) note = 'showing the first 1 MB'
          break
        case 'hex': {
          const head = new Uint8Array(await file.slice(0, PREVIEW_BYTES).arrayBuffer())
          text = bytesToHex(head, ' ')
          if (file.size > PREVIEW_BYTES) note = `showing the first ${formatBytes(PREVIEW_BYTES)}`
          break
        }
        case 'array': {
          const head = new Uint8Array(await file.slice(0, PREVIEW_BYTES).arrayBuffer())
          text = bytesToArrayLiteral(head, 2048)
          if (file.size > PREVIEW_BYTES) note = `built from the first ${formatBytes(PREVIEW_BYTES)}`
          break
        }
        case 'objecturl':
          objectUrl = URL.createObjectURL(file)
          text = objectUrl
          note = 'only valid in this tab, until you leave the page'
          break
      }
      if (live) setRes({ key, out: text, note, error: null })
    })().catch((e: unknown) => {
      if (live) setRes({ key, out: '', note: '', error: e instanceof Error ? e.message : String(e) })
    })
    return () => {
      live = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, format, detected, key])

  const out = ready?.out ?? ''
  return (
    <>
      {!file ? (
        <DropZone onFile={setFile} />
      ) : (
        <Panel title="File" actions={<button type="button" onClick={() => { setFile(null); setDetected(null) }}>Choose another</button>}>
          <KV rows={[
            ['Name', file.name],
            ['Size', `${formatBytes(file.size)} (${file.size.toLocaleString()} bytes)`],
            ['Declared type', file.type || 'none'],
            ['Detected type', detected ? `${detected.label} (${detected.mime})` : 'unknown'],
            ['Last modified', new Date(file.lastModified).toLocaleString()],
          ]} />
        </Panel>
      )}

      {file && (
        <Panel
          title="Output"
          actions={
            <>
              <CopyButton text={out} disabled={busy || format === 'objecturl'} />
              <button type="button" disabled={busy || !out} onClick={() => saveBlob(new Blob([out], { type: 'text/plain' }), `${file.name}.${format}.txt`)}>Download .txt</button>
            </>
          }
        >
          <Tabs<Format> value={format} onChange={setFormat} options={FORMATS} />
          {ready?.error ? <ErrorBox>{ready.error}</ErrorBox> : (
            <>
              <textarea readOnly value={busy ? 'Working…' : clip(out)} spellCheck={false} />
              <p className="muted small">
                {!busy && `${out.length.toLocaleString()} characters`}
                {ready?.note && ` · ${ready.note}`}
                {out.length > 200_000 && ' · display truncated; copy and download use the full text'}
              </p>
            </>
          )}
        </Panel>
      )}

      {file && (file.type.startsWith('image/') || detected?.mime.startsWith('image/')) && <ImageConverter file={file} />}
    </>
  )
}

function ImageConverter({ file }: { file: File }) {
  const [type, setType] = useState<ImageFormat>('image/webp')
  const [quality, setQuality] = useState(0.85)
  const [maxWidth, setMaxWidth] = useState('')
  const [result, setResult] = useState<{ blob: Blob; width: number; height: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const convert = async () => {
    setBusy(true)
    setError(null)
    try {
      setResult(await convertImage(file, type, { quality, maxWidth: Number(maxWidth) || undefined }))
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const ext = extensionForMime(type)
  return (
    <Panel title="Convert image">
      <div className="row">
        <label className="check">
          Format
          <select value={type} onChange={(e) => setType(e.target.value as ImageFormat)}>
            <option value="image/png">PNG (lossless)</option>
            <option value="image/jpeg">JPEG</option>
            <option value="image/webp">WebP</option>
          </select>
        </label>
        <label className="check">
          Quality {Math.round(quality * 100)}%
          <input type="range" min={0.1} max={1} step={0.05} value={quality} disabled={type === 'image/png'} onChange={(e) => setQuality(Number(e.target.value))} />
        </label>
        <label className="check">
          Max width
          <input type="number" min={1} className="narrow" placeholder="original" value={maxWidth} onChange={(e) => setMaxWidth(e.target.value)} />
        </label>
        <button type="button" className="primary" disabled={busy} onClick={() => void convert()}>{busy ? 'Converting…' : 'Convert'}</button>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {result && (
        <>
          <p className="muted small">
            {result.width}×{result.height} · {formatBytes(file.size)} → {formatBytes(result.blob.size)}
            {' '}({Math.round((result.blob.size / file.size) * 100)}% of the original)
          </p>
          <BlobPreview blob={result.blob} />
          <div className="row">
            <button type="button" onClick={() => saveBlob(result.blob, `${file.name.replace(/\.[^.]+$/, '')}.${ext}`)}>Download .{ext}</button>
          </div>
        </>
      )}
    </Panel>
  )
}

/* ---------------- data -> blob ---------------- */

type InKind = 'base64' | 'dataurl' | 'hex' | 'text'
const MIMES = ['application/octet-stream', 'text/plain', 'text/html', 'application/json', 'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'audio/mpeg', 'video/mp4', 'application/zip']

function ToBlob() {
  const [kind, setKind] = useState<InKind>('base64')
  const [input, setInput] = useState('')
  const [mimeOverride, setMimeOverride] = useState('')
  const [name, setName] = useState('')

  const parsed = useMemo(() => {
    if (!input.trim()) return null
    try {
      let bytes: Uint8Array
      let mime = ''
      if (kind === 'text') bytes = new TextEncoder().encode(input)
      else if (kind === 'hex') bytes = hexToBytes(input)
      else {
        const du = input.trim().startsWith('data:') ? parseDataURL(input) : null
        bytes = du ? du.bytes : base64ToBytes(input)
        mime = du?.mime ?? ''
      }
      const detected = sniffType(bytes)
      const finalMime = mimeOverride.trim() || mime || detected?.mime || (kind === 'text' ? 'text/plain' : 'application/octet-stream')
      return { ok: true as const, bytes, detected, mime: finalMime, blob: bytesToBlob(bytes, finalMime) }
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) }
    }
  }, [kind, input, mimeOverride])

  const ext = parsed?.ok ? (parsed.detected?.ext ?? extensionForMime(parsed.mime)) : 'bin'

  return (
    <div className="cols">
      <Panel title="Input">
        <div className="row">
          <label className="check">
            Data is
            <select value={kind} onChange={(e) => setKind(e.target.value as InKind)}>
              <option value="base64">Base64</option>
              <option value="dataurl">Data URL</option>
              <option value="hex">Hex bytes</option>
              <option value="text">Plain text</option>
            </select>
          </label>
          <label className="check">
            MIME type
            <input list="mimes" className="mime" placeholder="auto-detect" value={mimeOverride} onChange={(e) => setMimeOverride(e.target.value)} />
            <datalist id="mimes">{MIMES.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
        </div>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste Base64, a data: URL, hex bytes or text…" spellCheck={false} />
      </Panel>

      <Panel
        title="Blob"
        actions={parsed?.ok && (
          <button type="button" className="primary" onClick={() => saveBlob(parsed.blob, name.trim() || `blob.${ext}`)}>Download</button>
        )}
      >
        {!parsed && <p className="muted">Paste some data to build a Blob.</p>}
        {parsed && !parsed.ok && <ErrorBox>{parsed.message}</ErrorBox>}
        {parsed?.ok && (
          <>
            <KV rows={[
              ['Size', `${formatBytes(parsed.bytes.length)} (${parsed.bytes.length.toLocaleString()} bytes)`],
              ['MIME type', parsed.mime],
              ['Detected', parsed.detected ? parsed.detected.label : 'unknown'],
            ]} />
            <label className="check">
              File name
              <input type="text" placeholder={`blob.${ext}`} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {canPreview(parsed.mime) ? <BlobPreview blob={parsed.blob} mime={parsed.mime} /> : <p className="muted small">No inline preview for this type.</p>}
          </>
        )}
      </Panel>
    </div>
  )
}

