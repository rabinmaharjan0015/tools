import { useRef } from 'react'
import { formatBytes } from '../lib'

export interface InputFile {
  name: string
  data: Uint8Array
}

interface Props {
  text: string
  file: InputFile | null
  onText: (t: string) => void
  onFile: (f: InputFile | null) => void
}

export function InputPanel({ text, file, onText, onFile }: Props) {
  const picker = useRef<HTMLInputElement>(null)

  const load = async (f: File) => onFile({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })

  return (
    <section
      className="panel"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f) void load(f)
      }}
    >
      <header className="panel-head">
        <h2>Input</h2>
        <div className="row">
          <button type="button" onClick={() => picker.current?.click()}>Open file…</button>
          {(file || text) && (
            <button type="button" onClick={() => { onFile(null); onText('') }}>Clear</button>
          )}
        </div>
        <input
          ref={picker}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void load(f)
            e.target.value = ''
          }}
        />
      </header>

      {file ? (
        <div className="filebox">
          <strong>{file.name}</strong>
          <span className="muted">{formatBytes(file.data.length)}</span>
          <button type="button" onClick={() => onFile(null)}>Switch back to text</button>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="Type or paste text, or drop a file anywhere on this panel…"
          spellCheck={false}
        />
      )}
    </section>
  )
}
