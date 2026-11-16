import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Avatar, Card, Field, Pill, fmtDate, today, useNotice, type Me, asQuery } from '../ui'
import { errorText, wyndbase } from '../wyndbase'
import { OrgChart } from './OrgChart'

type Period = { value: unknown; reason: string | null; _effectiveFrom: string; _effectiveTo: string | null; recordedBy: string | null }
type History = Record<string, unknown> & { name: string; employeeNumber: string; hireDate: string }

// core.employeeHistory compiles and runs on the server but the CLI's typegen rejects it (see findings),
// so it is not on the typed tree and is called through a narrow cast.
const untypedCore = wyndbase.query.core as unknown as Record<string, (p: object) => unknown>

const JOB_FIELDS: [string, string][] = [
  ['jobTitleHistory', 'Job title'], ['departmentHistory', 'Department'], ['productTeamHistory', 'Product team'],
  ['managerHistory', 'Reports to'], ['locationHistory', 'Office'], ['legalEntityHistory', 'Legal entity'],
  ['employmentTypeHistory', 'Employment type'], ['workScheduleHistory', 'Schedule'], ['fteHistory', 'FTE'],
  ['costCenterHistory', 'Cost center'], ['statusHistory', 'Employment status'],
]

/** One employee's profile. The signed-in person may edit their own personal and contact details;
 *  HR sees the employment actions as well. */
export function Profile({ employeeId, me, go }: { employeeId: string; me: Me; go: (page: string, id?: string) => void }) {
  const isSelf = employeeId === me._id
  const isHr = !!(me.isHrAdmin || me.isHrManager)
  const [tab, setTab] = useState(isSelf ? 'personal' : 'job')
  const dir = useQuery(wyndbase.query.core.directory({ department: null, location: null, status: null }))
  const hist = useQuery(asQuery<History[]>(untypedCore.employeeHistory({ employee: employeeId })))
  const p = dir.data?.find((x) => x._id === employeeId)
  const h = hist.data?.[0]

  const tabs: [string, string, boolean][] = [
    ['personal', 'Personal', isSelf],
    ['contact', 'Contact', isSelf],
    ['job', 'Job', true],
    ['org', 'Org chart', true],
    ['history', 'History', isSelf || isHr],
    ['manage', 'Manage', isHr && !isSelf],
  ]
  return (
    <>
      <div className="profile-head">
        <Avatar name={p?.name ?? h?.name} size={96} />
        <div className="profile-id">
          <h1>{p?.name ?? h?.name ?? '…'}{p?.preferredName && p.preferredName !== p.name?.split(' ')[0] ? <span className="muted"> ({p.preferredName})</span> : null}</h1>
          <div className="profile-title">{p?.jobTitle}</div>
          <div className="profile-meta">
            <span>🏢 {p?.department}{p?.productTeam ? ` · ${p.productTeam}` : ''}</span>
            <span>📍 {p?.location}</span>
            {p?.workEmail ? <span>✉ {String(p.workEmail)}</span> : null}
            {p?.manager && <span>👤 Reports to <button className="link on-dark" onClick={() => p.managerId && go('person', p.managerId)}>{p.manager}</button></span>}
          </div>
        </div>
        <div className="profile-side">
          <Pill s={p?.status} />
          <div className="muted on-dark">#{h?.employeeNumber ?? p?.employeeNumber} · since {fmtDate(p?.hireDate)}</div>
        </div>
      </div>
      <nav className="tabs">
        {tabs.filter(([, , show]) => show).map(([k, label]) => (
          <button key={k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
      {tab === 'personal' && isSelf && <Personal />}
      {tab === 'contact' && isSelf && <Contact />}
      {tab === 'job' && (
        <Card title="Job information">
          <div className="fields">
            <Field label="Job title" value={p?.jobTitle} />
            <Field label="Department" value={p?.department} />
            <Field label="Product team" value={p?.productTeam} />
            <Field label="Reports to" value={p?.manager} />
            <Field label="Office" value={p?.location} />
            <Field label="Hire date" value={fmtDate(p?.hireDate)} />
            <Field label="Employee ID" value={p?.employeeNumber} />
            <Field label="Status" value={<Pill s={p?.status} />} />
          </div>
          {isSelf && <p className="muted">Job details are maintained by HR. Ask HR if something is out of date.</p>}
        </Card>
      )}
      {tab === 'org' && <OrgChart employeeId={employeeId} go={go} />}
      {tab === 'history' && (
        <Card title="Employment history" action={<span className="muted">every change is effective-dated, with its reason</span>}>
          {hist.error && <p className="error">{errorText(hist.error)}</p>}
          <div className="history">
            {JOB_FIELDS.map(([k, label]) => (
              <div key={k} className="history-col">
                <h3>{label}</h3>
                {((h?.[k] as Period[] | undefined) ?? []).map((per, i) => (
                  <div className={`period ${per._effectiveTo ? '' : 'current'}`} key={i}>
                    <strong>{String(per.value ?? '–')}</strong>
                    <div className="muted">{fmtDate(per._effectiveFrom)} → {per._effectiveTo ? fmtDate(per._effectiveTo) : 'now'}</div>
                    <div className="reason">{per.reason ?? <i>reason visible to HR only</i>}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}
      {tab === 'manage' && isHr && <Manage employeeId={employeeId} onDone={() => undefined} />}
    </>
  )
}

function Personal() {
  const me = useQuery(wyndbase.query.auth.getMe())
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState<Record<string, string>>({})
  const { run, view } = useNotice()
  const u = me.data?.[0]
  const start = () => {
    setF({
      givenName: u?.givenName ?? '', familyName: u?.familyName ?? '', middleName: u?.middleName ?? '', nickname: u?.nickname ?? '',
      pronouns: u?.pronouns ?? '', birthdate: u?.birthdate ?? '', gender: u?.gender ?? '', zoneinfo: u?.zoneinfo ?? '', website: u?.website ?? '',
    })
    setEdit(true)
  }
  const save = async () => {
    const nul = (v: string) => (v.trim() === '' ? null : v.trim())
    const ok = await run(() => wyndbase.mutation.auth.updateMyProfile({
      name: [f.givenName, f.middleName, f.familyName].filter((x) => x.trim()).join(' ') || null,
      givenName: nul(f.givenName), familyName: nul(f.familyName), middleName: nul(f.middleName), nickname: nul(f.nickname),
      pronouns: nul(f.pronouns), birthdate: nul(f.birthdate), gender: nul(f.gender), zoneinfo: nul(f.zoneinfo), website: nul(f.website),
    }), 'Saved. Your name updates everywhere in WynHR.')
    if (ok) {
      setEdit(false)
    }
  }
  const input = (k: string, label: string, type = 'text', ph = '') => (
    <label>{label}<input type={type} value={f[k] ?? ''} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  )
  return (
    <Card title="Personal information" action={!edit && <button className="secondary" onClick={start}>Edit</button>}>
      {!edit ? (
        <div className="fields">
          <Field label="First name" value={u?.givenName} />
          <Field label="Middle name" value={u?.middleName} />
          <Field label="Last name" value={u?.familyName} />
          <Field label="Preferred name" value={u?.nickname} />
          <Field label="Pronouns" value={u?.pronouns} />
          <Field label="Birth date" value={fmtDate(u?.birthdate)} />
          <Field label="Gender" value={u?.gender} />
          <Field label="Time zone" value={u?.zoneinfo} />
          <Field label="Website" value={u?.website} />
        </div>
      ) : (
        <>
          <div className="form">
            {input('givenName', 'First name')}{input('middleName', 'Middle name')}{input('familyName', 'Last name')}
            {input('nickname', 'Preferred name')}{input('pronouns', 'Pronouns', 'text', 'she/her, he/him, they/them…')}
            {input('birthdate', 'Birth date', 'date')}{input('gender', 'Gender')}
            {input('zoneinfo', 'Time zone', 'text', 'Europe/Istanbul')}{input('website', 'Website', 'url', 'https://')}
          </div>
          <button onClick={save}>Save</button>
          <button className="secondary" onClick={() => setEdit(false)}>Cancel</button>
        </>
      )}
      {view}
      <p className="muted">Birth date and gender are visible only to you and HR.</p>
    </Card>
  )
}

function Contact() {
  const phones = useQuery(wyndbase.query.auth.listMyPhones())
  const addrs = useQuery(wyndbase.query.auth.listMyAddresses())
  const [ph, setPh] = useState({ phone: '', label: 'Mobile' })
  const [ad, setAd] = useState({ label: 'Home', streetAddress: '', locality: '', region: '', postalCode: '', country: 'TR' })
  const { run, view } = useNotice()
  return (
    <div className="grid-2">
      <Card title="Phone numbers">
        {phones.data?.map((x) => (
          <div className="contact-row" key={x._id}>
            <div><strong>{x.phone}</strong> <span className="muted">{x.label}{x.primary ? ' · primary' : ''}</span></div>
            <button className="link" onClick={() => run(() => wyndbase.mutation.auth.removeMyPhone({ phoneId: x._id }), 'Removed.')}>Remove</button>
          </div>
        ))}
        {!phones.data?.length && <p className="muted">No phone numbers yet.</p>}
        <div className="form compact">
          <label>Number<input value={ph.phone} placeholder="+90 555 000 00 00" onChange={(e) => setPh({ ...ph, phone: e.target.value })} /></label>
          <label>Label<select value={ph.label} onChange={(e) => setPh({ ...ph, label: e.target.value })}><option>Mobile</option><option>Home</option><option>Work</option></select></label>
        </div>
        <button disabled={!ph.phone} onClick={() => run(() => wyndbase.mutation.auth.addMyPhone(ph), 'Phone added.').then((ok) => { if (ok) { setPh({ phone: '', label: 'Mobile' }) } })}>Add phone</button>
      </Card>
      <Card title="Addresses">
        {addrs.data?.map((x) => (
          <div className="contact-row" key={x._id}>
            <div><strong>{x.label}</strong><div className="muted">{[x.streetAddress, x.postalCode, x.locality, x.region, x.country].filter(Boolean).join(', ')}</div></div>
            <button className="link" onClick={() => run(() => wyndbase.mutation.auth.removeMyAddress({ addressId: x._id }), 'Removed.')}>Remove</button>
          </div>
        ))}
        {!addrs.data?.length && <p className="muted">No addresses yet.</p>}
        <div className="form compact">
          <label>Label<input value={ad.label} onChange={(e) => setAd({ ...ad, label: e.target.value })} /></label>
          <label className="wide">Street<input value={ad.streetAddress} onChange={(e) => setAd({ ...ad, streetAddress: e.target.value })} /></label>
          <label>City<input value={ad.locality} onChange={(e) => setAd({ ...ad, locality: e.target.value })} /></label>
          <label>Postal code<input value={ad.postalCode} onChange={(e) => setAd({ ...ad, postalCode: e.target.value })} /></label>
          <label>Country<select value={ad.country} onChange={(e) => setAd({ ...ad, country: e.target.value })}><option value="TR">Türkiye</option><option value="DE">Germany</option><option value="NL">Netherlands</option><option value="GB">United Kingdom</option><option value="US">United States</option></select></label>
        </div>
        <button disabled={!ad.streetAddress} onClick={() => run(() => wyndbase.mutation.auth.addMyAddress(ad), 'Address added.')}>Add address</button>
        <p className="muted">Your addresses are visible only to you and HR.</p>
      </Card>
      {view && <div className="span-2">{view}</div>}
    </div>
  )
}

function Manage({ employeeId, onDone }: { employeeId: string; onDone: () => void }) {
  const depts = useQuery(wyndbase.query.org.departmentsList())
  const [change, setChange] = useState({ field: 'jobTitle', value: '', reason: '', date: today() })
  const [term, setTerm] = useState({ date: today(), reason: '' })
  const { run, view } = useNotice()
  const go = (fn: () => Promise<unknown>, ok: string) => run(fn, ok).then((done) => done && onDone())
  return (
    <div className="grid-2">
      <Card title="Change or correct">
        <p className="muted">A <b>change</b> starts a new period from the date and keeps the history. A <b>correction</b> fixes the period that covers the date in place.</p>
        <div className="form">
          <label>Field
            <select value={change.field} onChange={(e) => setChange({ ...change, field: e.target.value, value: '' })}>
              <option value="jobTitle">Job title</option><option value="department">Department</option>
            </select>
          </label>
          <label>New value
            {change.field === 'department'
              ? <select value={change.value} onChange={(e) => setChange({ ...change, value: e.target.value })}><option value="">Choose…</option>{depts.data?.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select>
              : <input value={change.value} onChange={(e) => setChange({ ...change, value: e.target.value })} />}
          </label>
          <label>Effective from<input type="date" value={change.date} onChange={(e) => setChange({ ...change, date: e.target.value })} /></label>
          <label className="wide">Reason<input value={change.reason} onChange={(e) => setChange({ ...change, reason: e.target.value })} /></label>
        </div>
        <button disabled={!change.value || !change.reason} onClick={() => go(() => wyndbase.mutation.core.changeEmployment({ employee: employeeId, effectiveDate: change.date, changes: { [change.field]: change.value, [`${change.field}.reason`]: change.reason } }), 'Change recorded.')}>Record change</button>
        <button className="secondary" disabled={change.field !== 'jobTitle' || !change.value || !change.reason} onClick={() => go(() => wyndbase.mutation.core.correctJobTitle({ employee: employeeId, atDate: change.date, value: change.value, reason: change.reason }), 'Correction applied.')}>Correct</button>
      </Card>
      <Card title="Leave & termination">
        <div className="form">
          <label>Effective date<input type="date" value={term.date} onChange={(e) => setTerm({ ...term, date: e.target.value })} /></label>
          <label className="wide">Reason (required, HR-only)<input value={term.reason} onChange={(e) => setTerm({ ...term, reason: e.target.value })} /></label>
        </div>
        <button className="secondary" onClick={() => go(() => wyndbase.mutation.core.setLeaveStatus({ employee: employeeId, effectiveDate: term.date, onLeave: true, reason: term.reason }), 'Leave started.')}>Start leave</button>
        <button className="secondary" onClick={() => go(() => wyndbase.mutation.core.setLeaveStatus({ employee: employeeId, effectiveDate: term.date, onLeave: false, reason: term.reason }), 'Back to active.')}>End leave</button>
        <button className="danger" onClick={() => go(() => wyndbase.mutation.core.terminateEmployee({ employee: employeeId, effectiveDate: term.date, reason: term.reason }), 'Terminated. PTO balances are closed per policy.')}>Terminate</button>
      </Card>
      {view && <div className="span-2">{view}</div>}
    </div>
  )
}
