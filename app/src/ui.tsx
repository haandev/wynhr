import type { UseQueryOptions } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { errorText, wyndbase } from './wyndbase'

/** A named-query call whose rows typegen cannot type (see the findings): its descriptor, as useQuery options. */
export const asQuery = <T,>(descriptor: unknown) => descriptor as UseQueryOptions<T, Error, T, readonly unknown[]>

export type Me = Awaited<ReturnType<typeof wyndbase.query.core.me>>[number]

export const today = () => new Date().toISOString().slice(0, 10)
export const hrs = (v: unknown) => (v == null ? '–' : Number(v).toFixed(2))
export const days = (v: unknown) => (v == null ? '–' : (Number(v) / 8).toFixed(1))
export const fmtDate = (d?: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–')
export const fmtShort = (d?: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '–')

const PALETTE = ['#4f6bff', '#13a28c', '#e0663d', '#9b5de5', '#d4a017', '#e04f7a', '#2c8fd6']
export function Avatar({ name, size = 40 }: { name?: string | null; size?: number }) {
  const n = name ?? '?'
  const initials = n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
  const color = PALETTE[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: color }}>
      {initials}
    </span>
  )
}

export function Pill({ s }: { s: unknown }) {
  const label: Record<string, string> = { posted: 'Posted', notposted: 'Not posted', draft: 'Draft', active: 'Active', leave: 'On leave', terminated: 'Terminated', pending: 'Pending', approved: 'Approved', denied: 'Denied', canceled: 'Canceled' }
  return <span className={`pill pill-${String(s)}`}>{label[String(s)] ?? String(s ?? '–')}</span>
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="field-value">{value ?? '–'}</div>
    </div>
  )
}

type Col = [string, string, ((v: unknown, r: Record<string, unknown>) => ReactNode)?]
export function Table({ rows, cols, empty = 'Nothing here.' }: { rows?: Record<string, unknown>[]; cols: Col[]; empty?: string }) {
  if (!rows) return <p className="muted">Loading…</p>
  if (!rows.length) return <p className="muted">{empty}</p>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{cols.map(([, label]) => <th key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r._id ?? i)}>
              {cols.map(([k, label, fmt]) => <td key={label}>{fmt ? fmt(r[k], r) : String(r[k] ?? '–')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A small inline message for the result of an action. */
export function useNotice() {
  const [notice, setNotice] = useState<{ ok: boolean; text: string }>()
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setNotice(undefined)
    try {
      await fn()
      // A write can change what any screen shows (balances, lists, the org): mark every cached
      // query stale, so whatever is on screen refetches and the rest refetch when next shown.
      void wyndbase.queryClient.invalidateQueries()
      setNotice({ ok: true, text: ok })
      return true
    } catch (e) {
      setNotice({ ok: false, text: errorText(e) })
      return false
    }
  }
  const view = notice ? <p className={notice.ok ? 'note' : 'error'}>{notice.text}</p> : null
  return { run, view }
}
