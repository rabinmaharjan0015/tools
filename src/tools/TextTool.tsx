import { useMemo, useState } from 'react'
import { CopyButton, ErrorBox, KV, Panel } from '../components/ui'
import { TEXT_OPS, clip, textStats } from '../lib'

const GROUPS = [...new Set(TEXT_OPS.map((o) => o.group))]

export default function TextTool() {
  const [input, setInput] = useState('Hello, नेपाल! <b>"Stream"</b> & Tools 🇳🇵\nsecond line\nsecond line\nAnother one')
  const [opId, setOpId] = useState('html-enc')

  const op = TEXT_OPS.find((o) => o.id === opId) ?? TEXT_OPS[0]
  const result = useMemo(() => {
    try {
      return { out: op.run(input), error: null }
    } catch (e) {
      return { out: '', error: e instanceof Error ? e.message : String(e) }
    }
  }, [op, input])

  return (
    <div className="stack">
      <Panel title="Operation">
        <div className="stack tight">
          {GROUPS.map((g) => (
            <div className="group-row" key={g}>
              <span className="group-label">{g}</span>
              <div className="presets">
                {TEXT_OPS.filter((o) => o.group === g).map((o) => (
                  <button key={o.id} type="button" className={`chip ${o.id === opId ? 'on' : ''}`} aria-pressed={o.id === opId} onClick={() => setOpId(o.id)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="cols">
        <Panel title="Input" actions={<button type="button" onClick={() => setInput('')}>Clear</button>}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} placeholder="Type or paste text…" />
          <KV rows={Object.entries(textStats(input)).map(([k, v]) => [k, String(v)])} />
        </Panel>
        <Panel
          title={`Output · ${op.group}: ${op.label}`}
          actions={<><CopyButton text={result.out} /><button type="button" disabled={!result.out} onClick={() => setInput(result.out)}>Use as input</button></>}
        >
          {result.error ? <ErrorBox>{result.error}</ErrorBox> : <textarea readOnly value={clip(result.out)} spellCheck={false} />}
        </Panel>
      </div>
    </div>
  )
}
