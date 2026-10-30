import { useEffect, useState, type ComponentType } from 'react'
import Base64Tool from './tools/Base64Tool'
import BlobTool from './tools/BlobTool'
import ConvertersTool from './tools/ConvertersTool'
import DownloadTool from './tools/DownloadTool'
import GeneratorTool from './tools/GeneratorTool'
import HashTool from './tools/HashTool'
import InspectorTool from './tools/InspectorTool'
import JsonTool from './tools/JsonTool'
import JwtTool from './tools/JwtTool'
import PipelineTool from './tools/PipelineTool'
import TextTool from './tools/TextTool'
import UrlTool from './tools/UrlTool'
import './App.css'

interface Tool {
  id: string
  group: string
  label: string
  hint: string
  Component: ComponentType
}

const TOOLS: Tool[] = [
  { id: 'pipeline', group: 'Encode & convert', label: 'Stream Pipeline', hint: 'Chain Base64, hex, URL encoding, gzip, AES and hashes as streams. Works on text or files of any size.', Component: PipelineTool },
  { id: 'base64', group: 'Encode & convert', label: 'Base64', hint: 'Encode and decode text and files. Standard or URL-safe, wrapped or not, with data: URL support and previews.', Component: Base64Tool },
  { id: 'blob', group: 'Encode & convert', label: 'Blob Converter', hint: 'Turn a file into Base64, a data URL, hex, text or an object URL, build a Blob from data, and convert images.', Component: BlobTool },
  { id: 'download', group: 'Files & network', label: 'Download Manager', hint: 'Download with live progress, speed, ETA and a streaming checksum. Run several at once and cancel or retry any of them.', Component: DownloadTool },
  { id: 'hash', group: 'Files & network', label: 'Hash & Checksum', hint: 'MD5, SHA-1/256/384/512, CRC-32 and HMAC for text and files, with a progress bar and a verify box.', Component: HashTool },
  { id: 'inspector', group: 'Files & network', label: 'File Inspector', hint: 'Detect the real type from magic bytes, spot wrong extensions, check entropy and see a hex dump.', Component: InspectorTool },
  { id: 'jwt', group: 'Developer', label: 'JWT', hint: 'Decode tokens, see expiry at a glance, verify HMAC signatures and create signed tokens.', Component: JwtTool },
  { id: 'json', group: 'Developer', label: 'JSON', hint: 'Validate, format, minify, sort keys and escape or unescape strings.', Component: JsonTool },
  { id: 'url', group: 'Developer', label: 'URL', hint: 'Break a URL into parts, edit query parameters and compare percent-encodings.', Component: UrlTool },
  { id: 'text', group: 'Developer', label: 'Text Tools', hint: 'HTML entities, Unicode escapes, text as binary or hex, case conversion, line tools and stats.', Component: TextTool },
  { id: 'converters', group: 'Developer', label: 'Time & Numbers', hint: 'Unix timestamps in any unit and number bases of any size.', Component: ConvertersTool },
  { id: 'generators', group: 'Generate', label: 'Generators', hint: 'UUID v4/v7, passwords, Nano IDs and random keys from the browser’s secure random source.', Component: GeneratorTool },
]
const GROUPS = [...new Set(TOOLS.map((t) => t.group))]

const idFromHash = () => {
  const id = window.location.hash.slice(1)
  return TOOLS.some((t) => t.id === id) ? id : TOOLS[0].id
}

export default function App() {
  const [active, setActive] = useState(idFromHash)
  // Tools stay mounted once opened, so running downloads and typed input survive tab switches.
  const [visited, setVisited] = useState<string[]>(() => [idFromHash()])

  useEffect(() => {
    const onHash = () => setActive(idFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  if (!visited.includes(active)) setVisited([...visited, active])

  const current = TOOLS.find((t) => t.id === active) ?? TOOLS[0]
  useEffect(() => {
    document.title = `${current.label} · Stream Tools`
  }, [current])

  return (
    <div className="shell">
      <nav className="side" aria-label="Tools">
        <a className="brand" href="#pipeline">⇄ Stream Tools</a>
        {GROUPS.map((g) => (
          <div className="nav-group" key={g}>
            <div className="nav-title">{g}</div>
            {TOOLS.filter((t) => t.group === g).map((t) => (
              <a key={t.id} href={`#${t.id}`} className={t.id === active ? 'active' : ''} aria-current={t.id === active ? 'page' : undefined}>
                {t.label}
              </a>
            ))}
          </div>
        ))}
        <p className="nav-foot muted small">Everything runs locally in your browser. Nothing is uploaded.</p>
      </nav>

      <main className="content">
        {TOOLS.filter((t) => visited.includes(t.id)).map((t) => (
          <section key={t.id} hidden={t.id !== active} aria-labelledby={`h-${t.id}`}>
            <h1 id={`h-${t.id}`}>{t.label}</h1>
            <p className="muted lead">{t.hint}</p>
            <t.Component />
          </section>
        ))}
      </main>
    </div>
  )
}
