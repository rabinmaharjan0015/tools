import { useMemo, useState } from 'react'
import { CopyButton, ErrorBox, KV, Panel } from '../components/ui'

export default function UrlTool() {
  const [url, setUrl] = useState('https://user:pw@münchen.example:8080/a%20path/file.html?q=hello+world&tag=a&tag=b#section')
  const [text, setText] = useState('Hello, नेपाल & friends? 100% = ✓')

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, u: new URL(url.trim()) }
    } catch {
      return { ok: false as const }
    }
  }, [url])

  const setParams = (pairs: [string, string][]) => {
    if (!parsed.ok) return
    const u = new URL(parsed.u)
    u.search = ''
    for (const [k, v] of pairs) u.searchParams.append(k, v)
    setUrl(u.toString())
  }
  const pairs: [string, string][] = parsed.ok ? [...parsed.u.searchParams.entries()] : []
  const edit = (i: number, k: string, v: string) => setParams(pairs.map((p, j): [string, string] => (j === i ? [k, v] : p)))

  const safeDecode = (s: string) => {
    try { return decodeURIComponent(s) } catch { return '(not valid percent-encoding)' }
  }
  const rows: [string, string][] = [
    ['encodeURIComponent', encodeURIComponent(text)],
    ['encodeURI', encodeURI(text)],
    ['Form encoding (space → +)', new URLSearchParams({ x: text }).toString().slice(2)],
    ['decodeURIComponent', safeDecode(text)],
  ]

  return (
    <div className="stack">
      <Panel title="URL" actions={parsed.ok && <CopyButton text={parsed.u.toString()} label="Copy URL" />}>
        <textarea className="short" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} placeholder="Paste a URL…" />
        {!parsed.ok && url.trim() && <ErrorBox>Not a valid absolute URL. Include the scheme, for example https://</ErrorBox>}
      </Panel>

      {parsed.ok && (
        <div className="cols">
          <Panel title="Parts">
            <KV rows={[
              ['Protocol', parsed.u.protocol],
              ['Username', parsed.u.username || '–'],
              ['Password', parsed.u.password || '–'],
              ['Hostname (ASCII)', parsed.u.hostname],
              ['Port', parsed.u.port || '(default)'],
              ['Origin', parsed.u.origin],
              ['Path', parsed.u.pathname],
              ['Path (decoded)', safeDecode(parsed.u.pathname)],
              ['Query', parsed.u.search || '–'],
              ['Fragment', parsed.u.hash || '–'],
            ]} />
          </Panel>
          <Panel title="Query parameters" actions={<button type="button" onClick={() => setParams([...pairs, ['', '']])}>+ Add</button>}>
            {pairs.length === 0 && <p className="muted">No query parameters.</p>}
            <div className="stack tight">
              {pairs.map(([k, v], i) => (
                <div className="row nowrap" key={i}>
                  <input type="text" value={k} placeholder="key" aria-label={`Key ${i + 1}`} onChange={(e) => edit(i, e.target.value, v)} />
                  <input type="text" value={v} placeholder="value" aria-label={`Value ${i + 1}`} onChange={(e) => edit(i, k, e.target.value)} />
                  <button type="button" aria-label="Remove parameter" onClick={() => setParams(pairs.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      <Panel title="Encode / decode text">
        <textarea className="short" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
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
      </Panel>
    </div>
  )
}
