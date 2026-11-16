/**
 * Workaround: @wyndbase/sdk@0.1.3-preview.gf8a697ca imports "@wyndbase/wql/rows",
 * but the published @wyndbase/wql has no "./rows" export (see wyndbase-findings.md).
 * These are copies of the four helpers from @wyndbase/wql's src/rows.ts; vite.config.ts
 * aliases the missing specifier here. Remove once the package exports it.
 */
export function isArrayMember(key: string): boolean {
  return key === 'length' || key in Array.prototype || String(Number.parseInt(key, 10)) === key
}

export function tagWqlRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  const source = (payload ?? {}) as Record<string, unknown>
  const rows = Array.isArray(source.result) ? (source.result as unknown[]) : []
  for (const key of Object.keys(source)) {
    if (key === 'result' || isArrayMember(key)) continue
    Object.defineProperty(rows, key, { configurable: true, enumerable: true, value: source[key], writable: true })
  }
  return rows
}

export function wqlRowsMeta(value: unknown): Record<string, unknown> {
  const source = value as Record<string, unknown>
  const meta: Record<string, unknown> = {}
  for (const key of Object.keys(source)) if (!isArrayMember(key)) meta[key] = source[key]
  return meta
}

export function isTaggedWqlRows(value: unknown): boolean {
  return Array.isArray(value) && Object.keys(value).length !== value.length
}
