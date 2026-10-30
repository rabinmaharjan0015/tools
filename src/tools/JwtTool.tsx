import { useEffect, useMemo, useState } from 'react'
import { CopyButton, ErrorBox, KV, Panel } from '../components/ui'
import { JWT_HMAC_ALGS, JWT_TIME_CLAIMS, decodeJwt, relativeTime, signJwt, verifyJwtHmac } from '../lib'

const SAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

export default function JwtTool() {
  const [token, setToken] = useState(SAMPLE)
  const [secret, setSecret] = useState('your-256-bit-secret')
  const [check, setCheck] = useState<{ key: string; ok: boolean } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const decoded = useMemo(() => {
    if (!token.trim()) return null
    try {
      return { ok: true as const, jwt: decodeJwt(token) }
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) }
    }
  }, [token])

  const alg = decoded?.ok ? String(decoded.jwt.header.alg) : ''
  const checkKey = `${alg}\n${secret}\n${token}`
  const canCheck = !!decoded?.ok && !!secret && JWT_HMAC_ALGS.includes(alg)
  useEffect(() => {
    if (!canCheck) return
    let live = true
    verifyJwtHmac(token, secret)
      .then((ok) => live && setCheck({ key: checkKey, ok }))
      .catch(() => live && setCheck(null))
    return () => { live = false }
  }, [canCheck, token, secret, checkKey])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const verified = canCheck && check?.key === checkKey ? check.ok : null

  return (
    <div className="stack">
      <div className="cols">
        <Panel title="Token" actions={<button type="button" onClick={() => setToken('')}>Clear</button>}>
          <textarea value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste a JWT (with or without “Bearer ”)…" spellCheck={false} />
          <label className="check wide-label">
            Secret (HS256 / HS384 / HS512 only)
            <input type="text" className="wide" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Shared secret to verify the signature" />
          </label>
          {decoded?.ok && (
            <p className={verified === true ? 'ok' : verified === false ? 'bad' : 'muted small'}>
              {verified === true ? '✔ Signature verified' : verified === false ? '✘ Signature does not match this secret'
                : JWT_HMAC_ALGS.includes(alg) ? 'Enter the secret to verify the signature.' : `Signature check is not available for ${alg || 'this algorithm'} (only HMAC).`}
            </p>
          )}
          <p className="muted small">Decoding happens locally. Never paste production tokens into tools you do not trust, and remember that decoding is not verification.</p>
        </Panel>

        <Panel title="Decoded">
          {!decoded && <p className="muted">Paste a token to decode it.</p>}
          {decoded && !decoded.ok && <ErrorBox>{decoded.message}</ErrorBox>}
          {decoded?.ok && (
            <>
              <h3>Header</h3>
              <pre className="json">{JSON.stringify(decoded.jwt.header, null, 2)}</pre>
              <h3>Payload</h3>
              <pre className="json">{JSON.stringify(decoded.jwt.payload, null, 2)}</pre>
              <KV rows={JWT_TIME_CLAIMS.flatMap(([claim, label]) => {
                const v = decoded.jwt.payload[claim]
                if (typeof v !== 'number') return []
                const d = new Date(v * 1000)
                const status = claim === 'exp' ? (d.getTime() < now ? ' · EXPIRED' : ' · still valid') : claim === 'nbf' && d.getTime() > now ? ' · not yet valid' : ''
                return [[`${label} (${claim})`, `${d.toISOString()} · ${relativeTime(d, now)}${status}`] as [string, string]]
              })} />
            </>
          )}
        </Panel>
      </div>
      <Signer />
    </div>
  )
}

function Signer() {
  const [payload, setPayload] = useState('{\n  "sub": "user-123",\n  "role": "admin"\n}')
  const [secret, setSecret] = useState('change-me')
  const [alg, setAlg] = useState('HS256')
  const [addIat, setAddIat] = useState(true)
  const [expMin, setExpMin] = useState('60')
  const [out, setOut] = useState('')
  const [error, setError] = useState<string | null>(null)

  const sign = async () => {
    try {
      const obj: unknown = JSON.parse(payload)
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('The payload must be a JSON object')
      const now = Math.floor(Date.now() / 1000)
      const claims = { ...(addIat ? { iat: now } : {}), ...(Number(expMin) > 0 ? { exp: now + Number(expMin) * 60 } : {}), ...obj }
      setOut(await signJwt(claims, secret, alg))
      setError(null)
    } catch (e) {
      setOut('')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Panel title="Create a signed token (HMAC)" actions={<><CopyButton text={out} /></>}>
      <div className="cols">
        <div className="stack">
          <textarea value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} aria-label="Payload JSON" />
          <div className="row">
            <select value={alg} onChange={(e) => setAlg(e.target.value)} aria-label="Algorithm">{JWT_HMAC_ALGS.map((a) => <option key={a}>{a}</option>)}</select>
            <input type="text" className="secret" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Secret" aria-label="Secret" />
            <label className="check"><input type="checkbox" checked={addIat} onChange={(e) => setAddIat(e.target.checked)} /> iat = now</label>
            <label className="check">exp in <input type="number" min={0} className="narrow" value={expMin} onChange={(e) => setExpMin(e.target.value)} /> min</label>
            <button type="button" className="primary" onClick={() => void sign()}>Sign</button>
          </div>
        </div>
        <div className="stack">
          {error && <ErrorBox>{error}</ErrorBox>}
          <textarea readOnly value={out} placeholder="The signed token appears here" spellCheck={false} aria-label="Signed token" />
        </div>
      </div>
    </Panel>
  )
}
