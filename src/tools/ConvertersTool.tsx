import { useState } from 'react'
import { CopyButton, ErrorBox, Panel } from '../components/ui'
import { BASES, describeDate, formatBigInt, parseBigInt, parseTimestamp } from '../lib'

export default function ConvertersTool() {
  return (
    <div className="cols">
      <TimeSection />
      <NumberSection />
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

function TimeSection() {
  const [input, setInput] = useState(() => String(Math.floor(Date.now() / 1000)))
  const date = parseTimestamp(input)

  return (
    <Panel title="Timestamp" actions={<button type="button" onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}>Now</button>}>
      <input type="text" className="wide" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Unix seconds / ms / µs / ns, or any date string" aria-label="Timestamp" />
      <label className="check">
        Pick a date
        <input
          type="datetime-local"
          step={1}
          value={date ? toLocalInput(date) : ''}
          onChange={(e) => { const d = new Date(e.target.value); if (!Number.isNaN(d.getTime())) setInput(String(Math.floor(d.getTime() / 1000))) }}
        />
      </label>
      {!date && input.trim() && <ErrorBox>Could not read that as a date or Unix timestamp.</ErrorBox>}
      {date && (
        <table className="kv hashes">
          <tbody>
            {describeDate(date).map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td><code className="break">{v}</code></td>
                <td className="actions"><CopyButton text={v} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">Numbers below 1e11 are read as seconds, then milliseconds, microseconds and nanoseconds as they grow.</p>
    </Panel>
  )
}

function NumberSection() {
  const [input, setInput] = useState('255')
  const [base, setBase] = useState(10)

  let rows: [string, string][] = []
  let error: string | null = null
  try {
    const v = parseBigInt(input, base)
    rows = BASES.map((b) => [`Base ${b}`, formatBigInt(v, b)])
  } catch (e) {
    error = input.trim() ? (e instanceof Error ? e.message : String(e)) : null
  }

  return (
    <Panel title="Number base (any size)">
      <div className="row nowrap">
        <input type="text" className="wide" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Enter a number" aria-label="Number" />
        <select value={base} onChange={(e) => setBase(Number(e.target.value))} aria-label="Input base">
          {BASES.map((b) => <option key={b} value={b}>base {b}</option>)}
        </select>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {rows.length > 0 && (
        <table className="kv hashes">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td><code className="break">{v}</code></td>
                <td className="actions"><CopyButton text={v} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">Uses BigInt, so values beyond 2^53 stay exact. Prefixes 0b, 0o, 0x and separators (_ , space) are accepted.</p>
    </Panel>
  )
}
