import { useMemo, useState } from 'react'
import { CopyButton, ErrorBox, Panel } from '../components/ui'
import {
  bytesToBase64, bytesToHex, nanoid, passwordEntropy, randomBytes, randomPassword, uuidv4, uuidv7, type PasswordOptions,
} from '../lib'

export default function GeneratorTool() {
  return (
    <div className="stack">
      <UuidSection />
      <PasswordSection />
      <div className="cols">
        <NanoidSection />
        <BytesSection />
      </div>
    </div>
  )
}

function Output({ lines }: { lines: string[] }) {
  return <textarea className="short mono" readOnly value={lines.join('\n')} spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
}

function UuidSection() {
  const [version, setVersion] = useState<'v4' | 'v7'>('v4')
  const [count, setCount] = useState(5)
  const [upper, setUpper] = useState(false)
  const [hyphens, setHyphens] = useState(true)
  const [seed, setSeed] = useState(0)

  const lines = useMemo(() => {
    void seed
    return Array.from({ length: count }, () => {
      let id = version === 'v4' ? uuidv4() : uuidv7()
      if (!hyphens) id = id.replace(/-/g, '')
      return upper ? id.toUpperCase() : id
    })
  }, [version, count, upper, hyphens, seed])

  return (
    <Panel title="UUID" actions={<><CopyButton text={lines.join('\n')} label="Copy all" /><button type="button" className="primary" onClick={() => setSeed((s) => s + 1)}>Regenerate</button></>}>
      <div className="row">
        <select value={version} onChange={(e) => setVersion(e.target.value as 'v4' | 'v7')} aria-label="UUID version">
          <option value="v4">v4 (random)</option>
          <option value="v7">v7 (time-ordered)</option>
        </select>
        <label className="check">Count <input type="number" min={1} max={100} className="narrow" value={count} onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} /></label>
        <label className="check"><input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} /> Uppercase</label>
        <label className="check"><input type="checkbox" checked={hyphens} onChange={(e) => setHyphens(e.target.checked)} /> Hyphens</label>
      </div>
      <Output lines={lines} />
    </Panel>
  )
}

function PasswordSection() {
  const [opts, setOpts] = useState<PasswordOptions>({ length: 20, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false })
  const [count, setCount] = useState(5)
  const [seed, setSeed] = useState(0)

  const result = useMemo(() => {
    void seed
    try {
      return { lines: Array.from({ length: count }, () => randomPassword(opts)), error: null }
    } catch (e) {
      return { lines: [], error: e instanceof Error ? e.message : String(e) }
    }
  }, [opts, count, seed])

  const bits = passwordEntropy(opts)
  const strength = bits >= 100 ? 'very strong' : bits >= 70 ? 'strong' : bits >= 50 ? 'fair' : 'weak'
  const toggle = (k: 'lower' | 'upper' | 'digits' | 'symbols' | 'excludeAmbiguous') => setOpts((o) => ({ ...o, [k]: !o[k] }))

  return (
    <Panel title="Password" actions={<><CopyButton text={result.lines.join('\n')} label="Copy all" /><button type="button" className="primary" onClick={() => setSeed((s) => s + 1)}>Regenerate</button></>}>
      <div className="row">
        <label className="check">
          Length {opts.length}
          <input type="range" min={8} max={128} value={opts.length} onChange={(e) => setOpts((o) => ({ ...o, length: Number(e.target.value) }))} />
        </label>
        <label className="check"><input type="checkbox" checked={opts.lower} onChange={() => toggle('lower')} /> a-z</label>
        <label className="check"><input type="checkbox" checked={opts.upper} onChange={() => toggle('upper')} /> A-Z</label>
        <label className="check"><input type="checkbox" checked={opts.digits} onChange={() => toggle('digits')} /> 0-9</label>
        <label className="check"><input type="checkbox" checked={opts.symbols} onChange={() => toggle('symbols')} /> Symbols</label>
        <label className="check"><input type="checkbox" checked={opts.excludeAmbiguous} onChange={() => toggle('excludeAmbiguous')} /> No look-alikes (Il1O0)</label>
        <label className="check">Count <input type="number" min={1} max={50} className="narrow" value={count} onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} /></label>
      </div>
      {result.error ? <ErrorBox>{result.error}</ErrorBox> : <Output lines={result.lines} />}
      <p className="muted small">≈ {Math.round(bits)} bits of entropy ({strength}). Generated with crypto.getRandomValues and unbiased sampling; nothing leaves your browser.</p>
    </Panel>
  )
}

function NanoidSection() {
  const [size, setSize] = useState(21)
  const [count, setCount] = useState(5)
  const [seed, setSeed] = useState(0)
  const lines = useMemo(() => {
    void seed
    return Array.from({ length: count }, () => nanoid(size))
  }, [size, count, seed])
  return (
    <Panel title="Nano ID (URL-safe)" actions={<><CopyButton text={lines.join('\n')} label="Copy all" /><button type="button" className="primary" onClick={() => setSeed((s) => s + 1)}>Regenerate</button></>}>
      <div className="row">
        <label className="check">Length <input type="number" min={4} max={64} className="narrow" value={size} onChange={(e) => setSize(Math.min(64, Math.max(4, Number(e.target.value) || 4)))} /></label>
        <label className="check">Count <input type="number" min={1} max={50} className="narrow" value={count} onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} /></label>
      </div>
      <Output lines={lines} />
    </Panel>
  )
}

function BytesSection() {
  const [n, setN] = useState(32)
  const [fmt, setFmt] = useState<'hex' | 'base64' | 'base64url'>('hex')
  const [seed, setSeed] = useState(0)
  const out = useMemo(() => {
    void seed
    const b = randomBytes(n)
    return fmt === 'hex' ? bytesToHex(b) : bytesToBase64(b, { urlSafe: fmt === 'base64url' })
  }, [n, fmt, seed])
  return (
    <Panel title="Random bytes (keys, secrets)" actions={<><CopyButton text={out} /><button type="button" className="primary" onClick={() => setSeed((s) => s + 1)}>Regenerate</button></>}>
      <div className="row">
        <label className="check">Bytes <input type="number" min={1} max={1024} className="narrow" value={n} onChange={(e) => setN(Math.min(1024, Math.max(1, Number(e.target.value) || 1)))} /></label>
        <select value={fmt} onChange={(e) => setFmt(e.target.value as typeof fmt)} aria-label="Format">
          <option value="hex">Hex</option>
          <option value="base64">Base64</option>
          <option value="base64url">Base64URL</option>
        </select>
        <span className="muted small">{n * 8} bits</span>
      </div>
      <Output lines={[out]} />
    </Panel>
  )
}
