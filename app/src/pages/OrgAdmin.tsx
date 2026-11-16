import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Pill, Table, fmtDate, today, useNotice, asQuery } from '../ui'
import { wyndbase } from '../wyndbase'

type Period = { value: unknown; reason?: string | null; _effectiveFrom: string; _effectiveTo: string | null }
type Unit = { _id: string; code: string; name: string | null; active: boolean | null; head: string | null; headId: string | null; teamId?: string | null; parentTeamId?: string | null; parentTeam?: string | null; members?: number; nameHistory: Period[]; headHistory: Period[]; activeHistory: Period[] }

// org.adminDepartments / org.adminProductTeams run on the server, but the CLI's typegen rejects their
// nested EFFECTIVE ALL reads (see findings), so they are called through a narrow cast.
const untypedOrg = wyndbase.query.org as unknown as Record<string, (p: object) => unknown>

const COUNTRIES: [string, string][] = [['TR', 'Türkiye'], ['DE', 'Germany'], ['NL', 'Netherlands'], ['GB', 'United Kingdom'], ['US', 'United States']]

/** Organization structure for HR: departments and product teams (effective-dated), offices and cost centers. */
export function OrgAdmin() {
  const [tab, setTab] = useState('departments')
  return (
    <>
      <div className="subtabs">
        {([['departments', 'Departments'], ['teams', 'Product teams'], ['offices', 'Offices'], ['costcenters', 'Cost centers']] as const).map(([k, l]) => (
          <button key={k} className={tab === k ? 'chip active' : 'chip'} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'departments' && <Units kind="department" />}
      {tab === 'teams' && <Units kind="team" />}
      {tab === 'offices' && <Offices />}
      {tab === 'costcenters' && <CostCenters />}
    </>
  )
}

function Units({ kind }: { kind: 'department' | 'team' }) {
  const label = kind === 'department' ? 'Department' : 'Product team'
  const [asOf, setAsOf] = useState(today())
  const list = useQuery(asQuery<Unit[]>(untypedOrg[kind === 'department' ? 'adminDepartments' : 'adminProductTeams']({ asOf })))
  const people = useQuery(wyndbase.query.core.directory({ department: null, location: null, status: null }))
  const [sel, setSel] = useState<Unit | null>(null)
  const [create, setCreate] = useState({ code: '', name: '', from: today(), parent: '' })
  const [edit, setEdit] = useState({ name: '', head: '', reason: '', from: today(), parent: '' })
  const { run, view } = useNotice()
  const m = wyndbase.mutation.org
  const refresh = () => { setSel(null) }
  const isDept = kind === 'department'
  const all = (list.data ?? []) as Unit[]
  const parentOf = (u: Unit) => all.find((x) => x.teamId && x.teamId === u.parentTeamId)
  const open = (u: Unit) => { setSel(u); setEdit({ name: u.name ?? '', head: u.headId ?? '', reason: '', from: today(), parent: parentOf(u)?._id ?? '' }) }
  /** Ids of a department and everything below it, so it cannot be moved under itself. */
  const subtree = (u: Unit): Set<string> => { const ids = new Set([u._id]); let grew = true; while (grew) { grew = false; for (const x of all) if (!ids.has(x._id) && all.some((y) => ids.has(y._id) && y.teamId && y.teamId === x.parentTeamId)) { ids.add(x._id); grew = true } } return ids }

  return (
    <>
      <Card title={`${label}s`} action={<label className="inline-label">As of <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>}>
        <p className="muted">Names, heads and active status are effective-dated: a change starts on a date and the earlier value stays in the history, so the org as it was on any day can be shown.</p>
        <Table rows={list.data as unknown as Record<string, unknown>[] | undefined} empty={`No ${label.toLowerCase()}s on this date.`} cols={[
          ['code', 'Code'],
          ['name', 'Name', (v, r) => <button className="link" onClick={() => open(r as unknown as Unit)}>{String(v ?? '–')}</button>],
          ['head', 'Head', (v) => String(v ?? '–')],
          ...(isDept ? [['parentTeam', 'Part of', (_v: unknown, r: Record<string, unknown>) => parentOf(r as unknown as Unit)?.name ?? 'Company'] as [string, string, (v: unknown, r: Record<string, unknown>) => string], ['members', 'Team members'] as [string, string]] : []),
          ['active', 'Status', (v) => <Pill s={v ? 'active' : 'canceled'} />],
        ]} />
        {isDept && <button className="secondary" onClick={() => run(() => wyndbase.mutation.org.syncDepartmentTeams(), 'Department teams are in sync with the org.')}>Sync teams now</button>}
      </Card>

      {sel && (
        <Card title={`${sel.code} · ${sel.name}`} action={<button className="secondary" onClick={() => setSel(null)}>Close</button>}>
          <div className="grid-2">
            <div>
              <h3 className="section">Rename</h3>
              <div className="form compact">
                <label>New name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
                <label>From<input type="date" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} /></label>
              </div>
              <button disabled={!edit.name || edit.name === sel.name} onClick={() => run(() => (kind === 'department' ? m.renameDepartment : m.renameProductTeam)({ id: sel._id, name: edit.name, from: edit.from }), 'Renamed.').then((ok) => ok && refresh())}>Rename</button>

              <h3 className="section">Head</h3>
              <div className="form compact">
                <label>Head<select value={edit.head} onChange={(e) => setEdit({ ...edit, head: e.target.value })}><option value="">Choose…</option>{people.data?.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
                <label>From<input type="date" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} /></label>
                <label className="wide">Reason<input value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></label>
              </div>
              <button disabled={!edit.head || !edit.reason} onClick={() => run(() => (kind === 'department' ? m.setDepartmentHead : m.setProductTeamHead)({ id: sel._id, head: edit.head, from: edit.from, reason: edit.reason }), 'Head assigned.').then((ok) => ok && refresh())}>Assign head</button>

              {isDept && (
                <>
                  <h3 className="section">Part of</h3>
                  <div className="form compact">
                    <label>Parent department<select value={edit.parent} onChange={(e) => setEdit({ ...edit, parent: e.target.value })}><option value="">Company (top level)</option>{all.filter((x) => !subtree(sel).has(x._id)).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
                  </div>
                  <button disabled={edit.parent === (parentOf(sel)?._id ?? '')} onClick={() => run(() => m.setDepartmentParent({ id: sel._id, parent: edit.parent || null }), 'Moved. Leads of the new parent now oversee it.').then((ok) => ok && refresh())}>Move</button>
                  <p className="muted">The hierarchy drives access: a department head sees time off for their department and everything below it.</p>
                </>
              )}
              <h3 className="section">Status</h3>
              <button className={sel.active ? 'danger' : ''} onClick={() => run(() => (kind === 'department' ? m.setDepartmentActive : m.setProductTeamActive)({ id: sel._id, active: !sel.active, from: edit.from }), sel.active ? 'Deactivated.' : 'Reactivated.').then((ok) => ok && refresh())}>
                {sel.active ? `Deactivate from ${fmtDate(edit.from)}` : `Reactivate from ${fmtDate(edit.from)}`}
              </button>
            </div>
            <div>
              <h3 className="section">History</h3>
              {([['Name', sel.nameHistory], ['Head', sel.headHistory], ['Active', sel.activeHistory]] as const).map(([t, ps]) => (
                <div key={t} className="history-col">
                  <div className="field-label">{t}</div>
                  {(ps ?? []).length === 0 && <div className="muted">–</div>}
                  {(ps ?? []).map((p, i) => (
                    <div className={`period ${p._effectiveTo ? '' : 'current'}`} key={i}>
                      <strong>{typeof p.value === 'boolean' ? (p.value ? 'Active' : 'Inactive') : String(p.value ?? '–')}</strong>
                      <span className="muted"> {fmtDate(p._effectiveFrom)} → {p._effectiveTo ? fmtDate(p._effectiveTo) : 'now'}</span>
                      {p.reason && <div className="reason">{p.reason}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card title={`New ${label.toLowerCase()}`}>
        <div className="form">
          <label>Code<input value={create.code} placeholder={kind === 'department' ? 'FIN' : 'GROWTH'} onChange={(e) => setCreate({ ...create, code: e.target.value.toUpperCase() })} /></label>
          <label>Name<input value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} /></label>
          <label>Active from<input type="date" value={create.from} onChange={(e) => setCreate({ ...create, from: e.target.value })} /></label>
          {isDept && <label>Part of<select value={create.parent} onChange={(e) => setCreate({ ...create, parent: e.target.value })}><option value="">Company (top level)</option>{all.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>}
        </div>
        <button disabled={!create.code || !create.name} onClick={() => run(() => (isDept ? m.createDepartment({ ...create, parent: create.parent || null }) : m.createProductTeam({ code: create.code, name: create.name, from: create.from })), `${label} created.`).then((ok) => { if (ok) { setCreate({ code: '', name: '', from: today(), parent: '' }); refresh() } })}>Create</button>
      </Card>
      {view}
    </>
  )
}

function Offices() {
  const list = useQuery(wyndbase.query.org.adminLocations())
  const ents = useQuery(wyndbase.query.org.legalEntitiesList())
  const cals = useQuery(wyndbase.query.pto.payCalendarsList())
  const empty = { id: '', name: '', country: 'TR', timezone: 'Europe/Istanbul', legalEntity: '', payCalendar: '', active: true }
  const [f, setF] = useState(empty)
  const { run, view } = useNotice()
  return (
    <div className="grid-2">
      <Card title="Offices">
        <Table rows={list.data as unknown as Record<string, unknown>[] | undefined} cols={[
          ['name', 'Office', (v, r) => <button className="link" onClick={() => setF({ id: String(r._id), name: String(v), country: String(r.country), timezone: String(r.timezone ?? ''), legalEntity: String(r.legalEntity ?? ''), payCalendar: String(r.payCalendar ?? ''), active: !!r.active })}>{String(v)}</button>],
          ['country', 'Country'], ['legalEntityName', 'Legal entity'], ['payCalendarName', 'Pay calendar'], ['active', 'Status', (v) => <Pill s={v ? 'active' : 'canceled'} />],
        ]} />
        <p className="muted">An office's country decides which PTO policies and public holidays its people get.</p>
      </Card>
      <Card title={f.id ? `Edit ${f.name}` : 'New office'}>
        <div className="form">
          <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>Country<select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
          <label>Time zone<input value={f.timezone} placeholder="Europe/Istanbul" onChange={(e) => setF({ ...f, timezone: e.target.value })} /></label>
          <label>Legal entity<select value={f.legalEntity} onChange={(e) => setF({ ...f, legalEntity: e.target.value })}><option value="">Choose…</option>{ents.data?.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
          <label>Pay calendar<select value={f.payCalendar} onChange={(e) => setF({ ...f, payCalendar: e.target.value })}><option value="">Choose…</option>{cals.data?.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
          <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        </div>
        <button disabled={!f.name || !f.legalEntity || !f.payCalendar} onClick={() => run(() => wyndbase.mutation.org.saveLocation({ ...f, id: f.id || null }), 'Office saved.').then((ok) => { if (ok) { setF(empty) } })}>Save office</button>
        {f.id && <button className="secondary" onClick={() => setF(empty)}>New instead</button>}
        {view}
      </Card>
    </div>
  )
}

function CostCenters() {
  const list = useQuery(wyndbase.query.org.adminCostCenters())
  const empty = { id: '', code: '', name: '', active: true }
  const [f, setF] = useState(empty)
  const { run, view } = useNotice()
  return (
    <div className="grid-2">
      <Card title="Cost centers">
        <Table rows={list.data as unknown as Record<string, unknown>[] | undefined} cols={[
          ['code', 'Code', (v, r) => <button className="link" onClick={() => setF({ id: String(r._id), code: String(v), name: String(r.name), active: !!r.active })}>{String(v)}</button>],
          ['name', 'Name'], ['active', 'Status', (v) => <Pill s={v ? 'active' : 'canceled'} />],
        ]} />
      </Card>
      <Card title={f.id ? `Edit ${f.code}` : 'New cost center'}>
        <div className="form">
          <label>Code<input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></label>
          <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        </div>
        <button disabled={!f.code || !f.name} onClick={() => run(() => wyndbase.mutation.org.saveCostCenter({ ...f, id: f.id || null }), 'Cost center saved.').then((ok) => { if (ok) { setF(empty) } })}>Save</button>
        {f.id && <button className="secondary" onClick={() => setF(empty)}>New instead</button>}
        {view}
      </Card>
    </div>
  )
}
