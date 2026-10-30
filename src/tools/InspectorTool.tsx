import { useEffect, useState } from 'react'
import { DropZone, ErrorBox, KV, Panel, ProgressBar } from '../components/ui'
import { BlobPreview } from '../components/BlobPreview'
import { canPreview, formatBytes, hashBlob, hexDump, shannonEntropy, sniffType, type DetectedType, type Progress } from '../lib'

const SAME_EXT: Record<string, string[]> = {
  jpg: ['jpg', 'jpeg', 'jpe'], tif: ['tif', 'tiff'], zip: ['zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'jar', 'apk', 'epub', 'aab'],
  txt: ['txt', 'md', 'csv', 'log', 'js', 'ts', 'css', 'yml', 'yaml', 'ini', 'sh', 'py', 'tsx', 'jsx', 'toml'],
  json: ['json', 'map', 'webmanifest'], xml: ['xml', 'svg', 'xsl'], html: ['html', 'htm'], mp4: ['mp4', 'mov', 'm4a', 'm4v'],
  webm: ['webm', 'mkv'], ogg: ['ogg', 'ogv', 'oga', 'opus'], gz: ['gz', 'tgz'], exe: ['exe', 'dll', 'sys'], ico: ['ico', 'cur'],
}

interface Info {
  key: string
  detected: DetectedType | null
  entropy: number
  dump: string
  hashes: Record<string, string>
}

export default function InspectorTool() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<Info | { key: string; error: string } | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)

  const key = file ? `${file.name}:${file.size}:${file.lastModified}` : ''
  const current = result?.key === key ? result : null
  const info = current && 'hashes' in current ? current : null
  const error = current && 'error' in current ? current.error : null

  useEffect(() => {
    if (!file) return
    const ac = new AbortController()
    ;(async () => {
      const head = new Uint8Array(await file.slice(0, 1_048_576).arrayBuffer())
      const hashes = await hashBlob(file, ['MD5', 'SHA-256', 'CRC32'], { signal: ac.signal, onProgress: setProgress })
      if (!ac.signal.aborted) setResult({ key, detected: sniffType(head), entropy: shannonEntropy(head), dump: hexDump(head, 256), hashes })
    })().catch((e: unknown) => {
      if (!ac.signal.aborted) setResult({ key, error: e instanceof Error ? e.message : String(e) })
    })
    return () => ac.abort()
  }, [file, key])

  const ext = file?.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? '' : ''
  const mismatch = info?.detected && ext && !(SAME_EXT[info.detected.ext] ?? [info.detected.ext]).includes(ext)

  return (
    <div className="stack">
      {!file ? (
        <DropZone onFile={setFile} hint="analysed locally, nothing is uploaded" />
      ) : (
        <>
          <Panel title="File" actions={<button type="button" onClick={() => { setFile(null); setResult(null); setProgress(null) }}>Choose another</button>}>
            <KV rows={[
              ['Name', file.name],
              ['Size', `${formatBytes(file.size)} (${file.size.toLocaleString()} bytes)`],
              ['Declared type', file.type || 'none'],
              ['Last modified', new Date(file.lastModified).toLocaleString()],
              ...(info ? ([
                ['Detected type', info.detected ? `${info.detected.label} (${info.detected.mime})` : 'unknown / binary'],
                ['MD5', <code key="md5" className="break">{info.hashes.MD5}</code>],
                ['SHA-256', <code key="sha" className="break">{info.hashes['SHA-256']}</code>],
                ['CRC-32', <code key="crc" className="break">{info.hashes.CRC32}</code>],
              ] as [string, React.ReactNode][]) : []),
            ]} />
            {!info && !error && (
              <ProgressBar percent={progress?.percent ?? null} label={progress ? `Reading… ${formatBytes(progress.loaded)} of ${formatBytes(file.size)}` : 'Reading…'} />
            )}
            {error && <ErrorBox>{error}</ErrorBox>}
            {mismatch && info?.detected && (
              <div className="warn" role="alert">
                The extension “.{ext}” does not match the content, which looks like {info.detected.label}.
              </div>
            )}
          </Panel>

          {info && (
            <>
              <Panel title="Entropy">
                <ProgressBar
                  percent={(info.entropy / 8) * 100}
                  label={`${info.entropy.toFixed(2)} bits per byte (first 1 MB). ${info.entropy > 7.5 ? 'Very high: typical of compressed or encrypted data.' : info.entropy > 5 ? 'Medium: binary or dense data.' : 'Low: text or repetitive data.'}`}
                />
              </Panel>
              <Panel title="First 256 bytes">
                <pre className="dump">{info.dump}</pre>
              </Panel>
              {canPreview(file.type || info.detected?.mime || '') && (
                <Panel title="Preview"><BlobPreview blob={file} mime={file.type || info.detected?.mime} /></Panel>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
