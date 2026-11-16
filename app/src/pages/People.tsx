import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ExportMenu } from '../ExportMenu'
import { Avatar, Pill } from '../ui'
import { errorText, wyndbase } from '../wyndbase'

export function People({ go }: { go: (page: string, id?: string) => void }) {
  const depts = useQuery(wyndbase.query.org.departmentsList())
  const locs = useQuery(wyndbase.query.org.locationsList())
  const [f, setF] = useState({ department: '', location: '', status: '', q: '' })
  const dir = useQuery(wyndbase.query.core.directory({ department: f.department || null, location: f.location || null, status: f.status || null }))
  const rows = (dir.data ?? []).filter((p) => !f.q || `${p.name} ${p.jobTitle} ${p.preferredName}`.toLowerCase().includes(f.q.toLowerCase()))
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">People <span className="muted">{rows.length}</span></h1>
        <ExportMenu report="core.directory" title="Employee directory" empty={!rows.length} load={(format) => wyndbase.mutation.audit.exportDirectory({ format, department: f.department || null, location: f.location || null, status: f.status || null, q: f.q || null })} filters={{ department: depts.data?.find((d) => d._id === f.department)?.name ?? '', office: locs.data?.find((l) => l._id === f.location)?.name ?? '', status: f.status, search: f.q }} />
      </div>
      <div className="filters">
        <input className="search" placeholder="Search by name or title…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
          <option value="">All departments</option>
          {depts.data?.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        <select value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })}>
          <option value="">All offices</option>
          {locs.data?.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
        </select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Any status</option><option value="active">Active</option><option value="leave">On leave</option>
        </select>
      </div>
      {dir.error && <p className="error">{errorText(dir.error)}</p>}
      <div className="people-grid big">
        {rows.map((p) => (
          <button className="person-card" key={p._id} onClick={() => go('person', p._id)}>
            <Avatar name={p.name} size={64} />
            <strong>{p.name}</strong>
            <span className="person-title">{p.jobTitle}</span>
            <span className="muted">{p.department}{p.productTeam ? ` · ${p.productTeam}` : ''}</span>
            <span className="muted">📍 {p.location}</span>
            {p.status !== 'active' && <Pill s={p.status} />}
          </button>
        ))}
      </div>
    </>
  )
}
