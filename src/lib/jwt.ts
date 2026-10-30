import { base64ToBytes, bytesToBase64 } from './blob'
import { hmacBytes, type HmacAlgo } from './hash'

export interface DecodedJwt {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
  signingInput: string
}

const parseJson = (bytes: Uint8Array, what: string): Record<string, unknown> => {
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  } catch { /* fall through */ }
  throw new Error(`The ${what} is not a valid JSON object`)
}

export function decodeJwt(input: string): DecodedJwt {
  const token = input.trim().replace(/^bearer\s+/i, '')
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('A JWT has three dot-separated parts (header.payload.signature)')
  return {
    header: parseJson(base64ToBytes(parts[0]), 'header'),
    payload: parseJson(base64ToBytes(parts[1]), 'payload'),
    signature: parts[2],
    signingInput: `${parts[0]}.${parts[1]}`,
  }
}

const HMAC: Record<string, HmacAlgo> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }
export const JWT_HMAC_ALGS = Object.keys(HMAC)

const b64url = (bytes: Uint8Array) => bytesToBase64(bytes, { urlSafe: true, pad: false })

async function sign(signingInput: string, secret: string, alg: string): Promise<string> {
  const hash = HMAC[alg]
  if (!hash) throw new Error(`Only ${JWT_HMAC_ALGS.join(', ')} can be checked here (got "${alg}")`)
  const sig = await hmacBytes(hash, new TextEncoder().encode(secret), new TextEncoder().encode(signingInput))
  return b64url(sig)
}

export async function verifyJwtHmac(token: string, secret: string): Promise<boolean> {
  const jwt = decodeJwt(token)
  const expected = await sign(jwt.signingInput, secret, String(jwt.header.alg))
  return expected === jwt.signature
}

export async function signJwt(payload: object, secret: string, alg = 'HS256', extraHeader: object = {}): Promise<string> {
  const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)))
  const input = `${enc({ alg, typ: 'JWT', ...extraHeader })}.${enc(payload)}`
  return `${input}.${await sign(input, secret, alg)}`
}

export const JWT_TIME_CLAIMS: [string, string][] = [['exp', 'Expires'], ['iat', 'Issued at'], ['nbf', 'Not before']]
