import { CODEC_BY_ID, CODEC_GROUPS, CODECS, newStep, type CodecId, type Step, type StepStat, formatBytes } from '../lib'

interface Props {
  steps: Step[]
  stats: StepStat[] | null
  onChange: (steps: Step[]) => void
}

export function StepEditor({ steps, stats, onChange }: Props) {
  const update = (id: string, patch: Partial<Step>) =>
    onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="steps">
      {steps.length === 0 && <p className="muted">No steps yet: the output is a copy of the input. Add one below or pick a preset.</p>}

      {steps.map((step, i) => {
        const def = CODEC_BY_ID[step.codec]
        const stat = stats?.[i]
        return (
          <div className="step" key={step.id}>
            <span className="step-n">{i + 1}</span>

            <select
              aria-label={`Step ${i + 1} codec`}
              value={step.codec}
              onChange={(e) => {
                const next = CODEC_BY_ID[e.target.value as CodecId]
                update(step.id, { codec: next.id, mode: next.reversible ? step.mode : 'encode', options: {} })
              }}
            >
              {CODEC_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {CODECS.filter((c) => c.group === g).map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            {def.reversible ? (
              <div className="seg" role="group" aria-label="Direction">
                {(['encode', 'decode'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={step.mode === m ? 'on' : ''}
                    onClick={() => update(step.id, { mode: m })}
                  >
                    {def.verbs[m]}
                  </button>
                ))}
              </div>
            ) : (
              <span className="tag">one-way</span>
            )}

            {def.secret && (
              <input
                type="text"
                className="secret"
                placeholder={def.secret}
                aria-label={def.secret}
                value={step.options.secret ?? ''}
                onChange={(e) => update(step.id, { options: { ...step.options, secret: e.target.value } })}
              />
            )}
            {step.codec === 'url' && step.mode === 'decode' && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!step.options.plusAsSpace}
                  onChange={(e) => update(step.id, { options: { ...step.options, plusAsSpace: e.target.checked } })}
                />
                + = space
              </label>
            )}

            <span className="step-stat" title={def.description}>
              {stat ? `${formatBytes(stat.bytesIn)} → ${formatBytes(stat.bytesOut)} · ${stat.chunksOut} chunk${stat.chunksOut === 1 ? '' : 's'}` : ''}
            </span>

            <div className="step-actions">
              <button type="button" className="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="icon" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="icon" aria-label="Remove step" onClick={() => onChange(steps.filter((s) => s.id !== step.id))}>✕</button>
            </div>
          </div>
        )
      })}

      <select
        className="add"
        aria-label="Add step"
        value=""
        onChange={(e) => e.target.value && onChange([...steps, newStep(e.target.value as CodecId)])}
      >
        <option value="">+ Add step…</option>
        {CODEC_GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {CODECS.filter((c) => c.group === g).map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
