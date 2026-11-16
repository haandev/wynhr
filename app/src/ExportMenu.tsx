import { useState } from 'react'
import { exportReport, type ExportFormat, type ExportLoader } from './export'
import { errorText } from './wyndbase'

/** Export button with CSV / Excel / PDF choices; the rows come from a server query that logs the export. */
export function ExportMenu({ report, title, load, empty, filters }: { report: string; title: string; load: ExportLoader; empty?: boolean; filters: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<string>()
  const go = async (format: ExportFormat) => {
    setOpen(false)
    setErr(undefined)
    try {
      await exportReport(report, title, load, filters, format)
    } catch (e) {
      setErr(errorText(e))
    }
  }
  return (
    <span className="export">
      <button className="secondary" disabled={empty} onClick={() => setOpen((o) => !o)}>Export ▾</button>
      {open && (
        <span className="export-menu">
          <button onClick={() => go('csv')}>CSV</button>
          <button onClick={() => go('xlsx')}>Excel (.xlsx)</button>
          <button onClick={() => go('pdf')}>PDF</button>
        </span>
      )}
      {err && <span className="error"> {err}</span>}
    </span>
  )
}
