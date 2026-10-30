import { useState } from 'react'
import { CopyButton, ErrorBox, Panel } from '../components/ui'
import { clip, formatBytes, jsonEscapeString, jsonFormat, jsonMinify, jsonUnescapeString } from '../lib'

const SAMPLE = '{"name":"Stream Tools","tags":["json","format"],"nested":{"b":2,"a":1}}'

export default function JsonTool() {
  const [input, setInput] = useState(SAMPLE)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [indent, setIndent] = useState('2')

  const apply = (fn: (s: string) => string) => {
    try {
      setOutput(fn(input))
      setError(null)
    } catch (e) {
      setOutput('')
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const indentValue = indent === 'tab' ? '\t' : Number(indent)

  let validity: string
  try {
    JSON.parse(input)
    validity = `✔ Valid JSON · ${formatBytes(new TextEncoder().encode(input).length)}`
  } catch (e) {
    validity = input.trim() ? `✘ ${e instanceof Error ? e.message : String(e)}` : ''
  }

  return (
    <div className="stack">
      <Panel
        title="Actions"
        actions={
          <label className="check">
            Indent
            <select value={indent} onChange={(e) => setIndent(e.target.value)}>
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
              <option value="tab">Tab</option>
            </select>
          </label>
        }
      >
        <div className="presets">
          <button type="button" className="chip" onClick={() => apply((s) => jsonFormat(s, indentValue))}>Format</button>
          <button type="button" className="chip" onClick={() => apply(jsonMinify)}>Minify</button>
          <button type="button" className="chip" onClick={() => apply((s) => jsonFormat(s, indentValue, true))}>Sort keys + format</button>
          <button type="button" className="chip" onClick={() => apply(jsonEscapeString)}>Escape as string</button>
          <button type="button" className="chip" onClick={() => apply(jsonUnescapeString)}>Unescape string</button>
        </div>
      </Panel>
      <div className="cols">
        <Panel title="Input" actions={<button type="button" onClick={() => { setInput(''); setOutput(''); setError(null) }}>Clear</button>}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} placeholder="Paste JSON…" />
          <p className={validity.startsWith('✔') ? 'ok small' : 'bad small'}>{validity}</p>
        </Panel>
        <Panel
          title="Output"
          actions={<><CopyButton text={output} /><button type="button" disabled={!output} onClick={() => { setInput(output); setOutput('') }}>Use as input</button></>}
        >
          {error ? <ErrorBox>{error}</ErrorBox> : <textarea readOnly value={clip(output)} spellCheck={false} placeholder="Result appears here" />}
        </Panel>
      </div>
    </div>
  )
}
