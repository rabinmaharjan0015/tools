import { useRef, useState, type ReactNode } from 'react'

export function ProgressBar({ percent, label, tone }: { percent: number | null; label?: ReactNode; tone?: 'ok' | 'error' }) {
  const indeterminate = percent == null
  return (
    <div className="progress-wrap">
      <div
        className={`progress ${indeterminate ? 'indeterminate' : ''} ${tone ?? ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(percent)}
      >
        <div className="progress-fill" style={indeterminate ? undefined : { width: `${percent}%` }} />
      </div>
      {label != null && <div className="progress-label">{label}</div>}
    </div>
  )
}

export function CopyButton({ text, label = 'Copy', disabled }: { text: string; label?: string; disabled?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      disabled={disabled || !text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        } catch {
          /* clipboard blocked: nothing useful to do */
        }
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  )
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function DropZone({ onFile, hint }: { onFile: (f: File) => void; hint?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          input.current?.click()
        }
      }}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
    >
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      <strong>Drop a file here</strong>
      <span className="muted">or click to choose{hint ? ` · ${hint}` : ''}</span>
    </div>
  )
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="kv">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const ErrorBox = ({ children }: { children: ReactNode }) => (
  <div className="error" role="alert">{children}</div>
)

export const Panel = ({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) => (
  <section className="panel">
    <header className="panel-head">
      <h2>{title}</h2>
      {actions && <div className="row">{actions}</div>}
    </header>
    {children}
  </section>
)

