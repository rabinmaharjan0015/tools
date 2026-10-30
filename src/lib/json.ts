const sortDeep = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sortDeep)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortDeep(x)]))
      : v

export const jsonFormat = (s: string, indent: number | string = 2, sortKeys = false): string => {
  const v: unknown = JSON.parse(s)
  return JSON.stringify(sortKeys ? sortDeep(v) : v, null, indent)
}
export const jsonMinify = (s: string): string => JSON.stringify(JSON.parse(s))
export const jsonEscapeString = (s: string): string => JSON.stringify(s).slice(1, -1)
export const jsonUnescapeString = (s: string): string => JSON.parse(`"${s}"`) as string
