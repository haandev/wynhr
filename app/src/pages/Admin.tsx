import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Pill, Table, fmtShort, hrs, today, useNotice } from '../ui'
import { wyndbase } from '../wyndbase'
import { OrgAdmin } from './OrgAdmin'

type Row = Record<string, unknown>
const R = (x: unknown) => x as Row[] | undefined
const num = (v: string) => (v.trim() === '' ? null : Number(v))
const COUNTRIES: [string, string][] = [['TR', 'Türkiye'], ['DE', 'Germany'], ['NL', 'Netherlands'], ['GB', 'United Kingdom'], ['US', 'United States']]

/** HR administration: everything an HR admin configures, in the app rather than the database console. */
export function Admin() {
  const [tab, setTab] = useState('policies')
  const tabs: [string, string][] = [['org', 'Organization'], ['policies', 'PTO policies'], ['types', 'PTO types'], ['holidays', 'Public holidays'], ['accruals', 'Accruals & year-end'], ['adjust', 'Balance adjustment'], ['hire', 'Hire']]
  return (
    <>
      <h1 className="page-title">HR administration</h1>
      <nav className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {tab === 'org' && <OrgAdmin />}
      {tab === 'policies' && <Policies />}
      {tab === 'types' && <PtoTypes />}
      {tab === 'holidays' && <Holidays />}
      {tab === 'accruals' && <Accruals />}
      {tab === 'adjust' && <Adjust />}
      {tab === 'hire' && <Hire />}
    </>
  )
}

/* ---------------------------------------------------------------- policies */

const EMPTY_POLICY = { id: '', name: '', country: 'TR', ptoType: '', employmentType: '', accrualHoursPerPeriod: '8', prorateByFte: true, prorateFirstPeriod: true, annualAccrualCapHours: '', maxCarryoverHours: '', carryoverExpiryMonths: '', minRequestHours: '2', accrueDuringLeave: false, onTermination: 'forfeit', active: true }
const CHOICE_KEY: Record<string, string> = { 'Pay out balance': 'payout', 'Forfeit balance': 'forfeit', Permanent: 'permanent', 'Fixed term': 'fixed_term', Contractor: 'contractor', Intern: 'intern' }

function Policies() {
  const list = useQuery(wyndbase.query.pto.adminPolicies())
  const types = useQuery(wyndbase.query.pto.adminPtoTypes())
  const [f, setF] = useState<typeof EMPTY_POLICY | null>(null)
  const { run, view } = useNotice()
  const edit = (p: Row) => setF({
    id: String(p._id), name: String(p.name), country: String(p.country), ptoType: String(p.ptoType), employmentType: CHOICE_KEY[String(p.employmentType)] ?? '',
    accrualHoursPerPeriod: String(Number(p.accrualHoursPerPeriod)), prorateByFte: !!p.prorateByFte, prorateFirstPeriod: !!p.prorateFirstPeriod,
    annualAccrualCapHours: p.annualAccrualCapHours == null ? '' : String(Number(p.annualAccrualCapHours)), maxCarryoverHours: p.maxCarryoverHours == null ? '' : String(Number(p.maxCarryoverHours)),
    carryoverExpiryMonths: p.carryoverExpiryMonths == null ? '' : String(p.carryoverExpiryMonths), minRequestHours: String(Number(p.minRequestHours)),
    accrueDuringLeave: !!p.accrueDuringLeave, onTermination: CHOICE_KEY[String(p.onTermination)] ?? 'forfeit', active: !!p.active,
  })
  const save = () => f && run(async () => {
    const saved = (await wyndbase.mutation.pto.savePolicy({
      id: f.id || null, name: f.name, country: f.country, ptoType: f.ptoType,
      accrualHoursPerPeriod: Number(f.accrualHoursPerPeriod), prorateByFte: f.prorateByFte, prorateFirstPeriod: f.prorateFirstPeriod,
      annualAccrualCapHours: num(f.annualAccrualCapHours), maxCarryoverHours: num(f.maxCarryoverHours), carryoverExpiryMonths: num(f.carryoverExpiryMonths),
      minRequestHours: Number(f.minRequestHours), accrueDuringLeave: f.accrueDuringLeave, onTermination: f.onTermination, active: f.active,
    })) as unknown as { _id: string }[]
    const id = saved[0]?._id ?? f.id
    // $choice cannot take a null, so "any employment type" is its own query (see findings).
    if (f.employmentType) await wyndbase.mutation.pto.setPolicyEmploymentType({ id, employmentType: f.employmentType })
    else await wyndbase.mutation.pto.clearPolicyEmploymentType({ id })
  }, 'Policy saved. The previous version is kept in its history; past accruals are not changed — rerun accruals to recalculate.').then((ok) => { if (ok) { setF(null) } })

  const inp = (k: keyof typeof EMPTY_POLICY, label: string, type = 'text', hint = '') => (
    <label>{label}<input type={type} value={String(f?.[k] ?? '')} placeholder={hint} onChange={(e) => f && setF({ ...f, [k]: e.target.value })} /></label>
  )
  const chk = (k: keyof typeof EMPTY_POLICY, label: string) => (
    <label className="check"><input type="checkbox" checked={!!f?.[k]} onChange={(e) => f && setF({ ...f, [k]: e.target.checked })} /> {label}</label>
  )
  return (
    <>
      <Card title="PTO policies" action={<button onClick={() => setF({ ...EMPTY_POLICY, ptoType: String(types.data?.[0]?._id ?? '') })}>New policy</button>}>
        <p className="muted">A policy sets, per country and employment type, how much time off is earned each pay period and what happens at year end and on termination. New hires get their office country's active policies.</p>
        <Table rows={R(list.data)} cols={[
          ['name', 'Policy', (v, r) => <button className="link" onClick={() => edit(r)}>{String(v)}</button>],
          ['country', 'Country'], ['ptoTypeName', 'Type'], ['employmentType', 'Employment', (v) => String(v ?? 'Any')],
          ['accrualHoursPerPeriod', 'h / period', hrs], ['annualAccrualCapHours', 'Yearly cap', hrs], ['maxCarryoverHours', 'Max carryover', hrs],
          ['accrueDuringLeave', 'Accrues on leave', (v) => (v ? 'Yes' : 'No')], ['onTermination', 'On termination'], ['assigned', 'Employees'],
          ['active', 'Status', (v) => <Pill s={v ? 'active' : 'canceled'} />],
          ['_id', '', (v, r) => r.active ? <button className="link" onClick={() => run(() => wyndbase.mutation.pto.assignPolicyToEligible({ policy: String(v), from: today(), reason: 'Policy rolled out' }), `Assigned to everyone in ${String(r.country)} who did not have it.`)}>Assign to {String(r.country)}</button> : null],
        ]} />
      </Card>
      {f && (
        <Card title={f.id ? `Edit ${f.name}` : 'New policy'}>
          <div className="form">
            {inp('name', 'Name')}
            <label>Country<select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
            <label>PTO type<select value={f.ptoType} onChange={(e) => setF({ ...f, ptoType: e.target.value })}>{types.data?.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></label>
            <label>Employment type<select value={f.employmentType} onChange={(e) => setF({ ...f, employmentType: e.target.value })}><option value="">Any</option><option value="permanent">Permanent</option><option value="fixed_term">Fixed term</option><option value="contractor">Contractor</option><option value="intern">Intern</option></select></label>
            {inp('accrualHoursPerPeriod', 'Hours accrued per pay period', 'number')}
            {inp('annualAccrualCapHours', 'Yearly accrual cap (h)', 'number', 'no cap')}
            {inp('maxCarryoverHours', 'Max carryover into next year (h)', 'number', 'unlimited')}
            {inp('carryoverExpiryMonths', 'Carryover expires after (months)', 'number', 'never')}
            {inp('minRequestHours', 'Minimum request (h)', 'number')}
            <label>On termination<select value={f.onTermination} onChange={(e) => setF({ ...f, onTermination: e.target.value })}><option value="payout">Pay out balance</option><option value="forfeit">Forfeit balance</option></select></label>
            {chk('prorateByFte', 'Prorate by FTE')}{chk('prorateFirstPeriod', 'Prorate first pay period')}{chk('accrueDuringLeave', 'Keeps accruing while on leave')}{chk('active', 'Active')}
          </div>
          <button disabled={!f.name || !f.ptoType} onClick={save}>Save policy</button>
          <button className="secondary" onClick={() => setF(null)}>Cancel</button>
        </Card>
      )}
      {view}
    </>
  )
}

/* ---------------------------------------------------------------- PTO types */

function PtoTypes() {
  const list = useQuery(wyndbase.query.pto.adminPtoTypes())
  const [f, setF] = useState({ id: '', code: '', name: '', category: 'custom', paid: true, active: true })
  const { run, view } = useNotice()
  const KEY: Record<string, string> = { Vacation: 'vacation', Sick: 'sick', Personal: 'personal', Custom: 'custom' }
  return (
    <div className="grid-2">
      <Card title="PTO types">
        <Table rows={R(list.data)} cols={[
          ['name', 'Name', (v, r) => <button className="link" onClick={() => setF({ id: String(r._id), code: String(r.code), name: String(v), category: KEY[String(r.category)] ?? 'custom', paid: !!r.paid, active: !!r.active })}>{String(v)}</button>],
          ['code', 'Code'], ['category', 'Category'], ['paid', 'Paid', (v) => (v ? 'Paid' : 'Unpaid')], ['active', 'Status', (v) => <Pill s={v ? 'active' : 'canceled'} />],
        ]} />
      </Card>
      <Card title={f.id ? `Edit ${f.name}` : 'New PTO type'}>
        <div className="form">
          <label>Code<input value={f.code} disabled={!!f.id} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></label>
          <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>Category<select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="vacation">Vacation</option><option value="sick">Sick</option><option value="personal">Personal</option><option value="custom">Custom</option></select></label>
          <label className="check"><input type="checkbox" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} /> Paid</label>
          <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        </div>
        <button disabled={!f.code || !f.name} onClick={() => run(() => wyndbase.mutation.pto.savePtoType({ ...f, id: f.id || null }), 'PTO type saved.').then((ok) => { if (ok) { setF({ id: '', code: '', name: '', category: 'custom', paid: true, active: true }) } })}>Save</button>
        {f.id && <button className="secondary" onClick={() => setF({ id: '', code: '', name: '', category: 'custom', paid: true, active: true })}>New instead</button>}
        {view}
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------------- holidays */

function Holidays() {
  const [country, setCountry] = useState('TR')
  const [year, setYear] = useState(new Date().getFullYear() + 1)
  const list = useQuery(wyndbase.query.pto.adminHolidays({ country, year }))
  const [add, setAdd] = useState({ holidayDate: `${new Date().getFullYear() + 1}-01-01`, name: '', hours: '8' })
  const { run, view } = useNotice()
  const copyFromLastYear = async () => {
    const rows = await wyndbase.query.pto.copyHolidaysPreview({ country, fromYear: year - 1, toYear: year })
    if (!rows.length) return run(async () => { throw new Error(`No ${country} holidays in ${year - 1} to copy.`) }, '')
    const holidays = rows.map((r) => ({ country: r.country, name: r.name, hours: r.hours, holidayDate: String(r.newDate).slice(0, 10), calendarYear: r.newYear }))
    await run(() => wyndbase.mutation.pto.insertHolidayDrafts({ holidays }), `Copied ${rows.length} holidays from ${year - 1} as drafts. Review the dates (moving feasts change every year), then activate.`)
  }
  const drafts = (list.data ?? []).filter((h) => h.status === 'draft')
  return (
    <>
      <Card title="Public holidays" action={
        <div className="filters">
          <select value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>{[-1, 0, 1, 2].map((d) => new Date().getFullYear() + d).map((y) => <option key={y}>{y}</option>)}</select>
          <button className="secondary" onClick={copyFromLastYear}>Copy from {year - 1}</button>
          {drafts.length > 0 && <button onClick={() => run(async () => { for (const d of drafts) await wyndbase.mutation.pto.setHolidayStatus({ id: d._id, status: 'active' }) }, `Activated ${drafts.length} holidays.`)}>Activate all drafts ({drafts.length})</button>}
        </div>}>
        <p className="muted">Holidays start as drafts. Only active holidays show in calendars and count for employees.</p>
        <Table rows={R(list.data)} empty={`No ${country} holidays for ${year} yet. Copy last year's or add one.`} cols={[
          ['holidayDate', 'Date', (v) => fmtShort(String(v))], ['name', 'Holiday'], ['hours', 'Hours', hrs], ['status', 'Status', (v) => <Pill s={v} />],
          ['_id', '', (v, r) => r.status === 'draft'
            ? <><button className="link" onClick={() => run(() => wyndbase.mutation.pto.setHolidayStatus({ id: String(v), status: 'active' }), 'Activated.')}>Activate</button>{'  ·  '}<button className="link" onClick={() => run(() => wyndbase.mutation.pto.deleteHoliday({ id: String(v) }), 'Deleted.')}>Delete</button></>
            : <button className="link" onClick={() => run(() => wyndbase.mutation.pto.setHolidayStatus({ id: String(v), status: 'draft' }), 'Back to draft.')}>Deactivate</button>],
        ]} />
      </Card>
      <Card title="Add a holiday">
        <div className="form">
          <label>Date<input type="date" value={add.holidayDate} onChange={(e) => setAdd({ ...add, holidayDate: e.target.value })} /></label>
          <label>Name<input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></label>
          <label>Hours off<input type="number" step={0.5} value={add.hours} onChange={(e) => setAdd({ ...add, hours: e.target.value })} /></label>
        </div>
        <button disabled={!add.name} onClick={() => run(() => wyndbase.mutation.pto.addHoliday({ country, ...add, hours: Number(add.hours) }), 'Added as draft.')}>Add as draft</button>
      </Card>
      {view}
    </>
  )
}

/* ---------------------------------------------------------------- accruals */

function Accruals() {
  const periods = useQuery(wyndbase.query.pto.payPeriodsList())
  const [preview, setPreview] = useState<{ title: string; rows: Row[]; toPost: number; post: () => Promise<unknown> } | null>(null)
  const [year, setYear] = useState(new Date().getFullYear() - 1)
  const { run, view } = useNotice()
  const previewPeriod = async (p: Row) => {
    const rows = (await wyndbase.query.pto.accrualPreview({ period: p._id })) as unknown as Row[]
    const todo = rows.filter((r) => !r.alreadyPosted && Number(r.hours) > 0)
    setPreview({
      title: `Accruals for ${p.calendar}, ${fmtShort(String(p.periodStart))} – ${fmtShort(String(p.periodEnd))}`, rows, toPost: todo.length,
      post: () => wyndbase.mutation.pto.postLedgerEntries({ entries: todo.map((r) => ({ employee: r.employee, policy: r.policy, payPeriod: r.payPeriod, entryType: 'accrual', hours: r.hours, entryDate: String(r.entryDate).slice(0, 10), reason: 'Per-period accrual' })) }),
    })
  }
  const previewYearEnd = async () => {
    const rows = (await wyndbase.query.pto.yearEndPreview({ year })) as unknown as Row[]
    const todo = rows.filter((r) => !r.alreadyPosted && Number(r.hours) < 0)
    setPreview({
      title: `Year-end ${year}: expire balances above the carryover limit`, rows, toPost: todo.length,
      post: () => wyndbase.mutation.pto.postLedgerEntries({ entries: todo.map((r) => ({ employee: r.employee, policy: r.policy, payPeriod: r.payPeriod, entryType: 'expiry', hours: r.hours, entryDate: `${year}-12-31`, reason: `Year-end ${year}: excess over max carryover expired` })) }),
    })
  }
  return (
    <>
      <Card title="Pay periods" action={<span className="muted">Accruals post automatically every day for closed periods; preview and post one here after a policy change.</span>}>
        <Table rows={R(periods.data)?.slice(0, 12)} cols={[
          ['calendar', 'Calendar'], ['periodStart', 'From', (v) => fmtShort(String(v))], ['periodEnd', 'To', (v) => fmtShort(String(v))],
          ['posted', 'Accruals', (v, r) => (v ? <Pill s="posted" /> : r.closed ? <Pill s="notposted" /> : <span className="muted">open</span>)],
          ['_id', '', (_v, r) => <button className="link" onClick={() => previewPeriod(r)}>Preview</button>],
        ]} />
      </Card>
      <Card title="Year-end carryover" action={<div className="filters"><select value={year} onChange={(e) => setYear(Number(e.target.value))}>{[0, 1, 2].map((d) => new Date().getFullYear() - d).map((y) => <option key={y}>{y}</option>)}</select><button className="secondary" onClick={previewYearEnd}>Preview</button></div>}>
        <p className="muted">Balances above a policy's maximum carryover expire on 31 December. Nothing is written until you post.</p>
      </Card>
      {preview && (
        <Card title={preview.title} action={<><button disabled={!preview.toPost} title={preview.toPost ? '' : 'Nothing new to post'} onClick={() => run(preview.post, `Posted ${preview.toPost} entries to the ledger.`).then((ok) => { if (ok) { setPreview(null) } })}>{preview.toPost ? `Post ${preview.toPost} entries` : 'Nothing to post'}</button><button className="secondary" onClick={() => setPreview(null)}>Close</button></>}>
          <Table rows={preview.rows} cols={[['employeeNumber', 'ID'], ['employeeName', 'Employee'], ['policyName', 'Policy'], ['status', 'Status'], ['balanceAtYearEnd', 'Balance', hrs], ['hours', 'Hours', hrs], ['alreadyPosted', 'Posted', (v) => (v ? 'Yes' : '')]]} />
        </Card>
      )}
      {view}
    </>
  )
}

/* ---------------------------------------------------------------- adjust */

function Adjust() {
  const people = useQuery(wyndbase.query.core.directory({ department: null, location: null, status: null }))
  const [emp, setEmp] = useState('')
  const balances = useQuery({ ...wyndbase.query.pto.balances({ employee: emp }).options(), enabled: !!emp })
  const [f, setF] = useState({ policy: '', hours: '', reason: '' })
  const { run, view } = useNotice()
  return (
    <Card title="Manual balance adjustment">
      <p className="muted">Adds or removes hours with a required reason. Ledger entries are permanent and audited; to undo, post the opposite adjustment.</p>
      <div className="form">
        <label>Employee<select value={emp} onChange={(e) => { setEmp(e.target.value); setF({ ...f, policy: '' }) }}><option value="">Choose…</option>{people.data?.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
        <label>Policy<select value={f.policy} onChange={(e) => setF({ ...f, policy: e.target.value })}><option value="">Choose…</option>{balances.data?.map((b) => <option key={String(b.policy)} value={String(b.policy)}>{b.policyName} (now {hrs(b.remaining)} h)</option>)}</select></label>
        <label>Hours (+/−)<input type="number" step={0.25} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></label>
        <label className="wide">Reason<input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
      </div>
      <button disabled={!emp || !f.policy || !f.hours} onClick={() => run(() => wyndbase.mutation.pto.adjustBalance({ employee: emp, policy: f.policy, hours: Number(f.hours), reason: f.reason }), 'Adjustment posted.').then((ok) => { if (ok) { setF({ policy: '', hours: '', reason: '' }) } })}>Post adjustment</button>
      {view}
    </Card>
  )
}

/* ---------------------------------------------------------------- hire */

function Hire() {
  const depts = useQuery(wyndbase.query.org.departmentsList())
  const teams = useQuery(wyndbase.query.org.productTeamsList())
  const locs = useQuery(wyndbase.query.org.locationsList())
  const ents = useQuery(wyndbase.query.org.legalEntitiesList())
  const ccs = useQuery(wyndbase.query.org.costCentersList())
  const people = useQuery(wyndbase.query.core.directory({ department: null, location: null, status: null }))
  const [f, setF] = useState({ givenName: '', familyName: '', email: '', username: '', employeeNumber: '', hireDate: today(), jobTitle: '', department: '', productTeam: '', manager: '', location: '', legalEntity: '', costCenter: '', employmentType: 'permanent', workSchedule: 'full_time', fte: '1', baseSalary: '', currency: 'TRY', payFrequency: 'annual' })
  const { run, view } = useNotice()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const sel = (k: keyof typeof f, label: string, opts?: { _id: string; name: string | null }[], optional = false) => (
    <label>{label}<select value={f[k]} onChange={set(k)}><option value="">{optional ? 'None' : 'Choose…'}</option>{opts?.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}</select></label>
  )
  const hire = () => run(async () => {
    const acct = (await wyndbase.mutation.auth.createAccount({ username: f.username || null, email: f.email, givenName: f.givenName, familyName: f.familyName, name: `${f.givenName} ${f.familyName}` })) as unknown as { _id?: string; userId?: string }[]
    const userId = acct[0]?._id ?? acct[0]?.userId
    if (!userId) throw new Error('The account was created but no id came back.')
    await wyndbase.mutation.core.hireEmployee({
      userId, employeeNumber: f.employeeNumber, hireDate: f.hireDate, jobTitle: f.jobTitle, department: f.department, productTeam: f.productTeam || null, manager: f.manager || null,
      location: f.location, legalEntity: f.legalEntity, costCenter: f.costCenter, employmentType: f.employmentType, workSchedule: f.workSchedule, fte: Number(f.fte),
      baseSalary: Number(f.baseSalary), currency: f.currency, payFrequency: f.payFrequency,
    })
  }, `${f.givenName} is hired. They get an email to set their password, and their country's PTO policies are assigned from ${f.hireDate}.`)
  const ready = f.givenName && f.familyName && f.email && f.employeeNumber && f.jobTitle && f.department && f.location && f.legalEntity && f.costCenter && f.baseSalary
  return (
    <Card title="Hire a new employee">
      <h3 className="section">Person</h3>
      <div className="form">
        <label>First name<input value={f.givenName} onChange={set('givenName')} /></label>
        <label>Last name<input value={f.familyName} onChange={set('familyName')} /></label>
        <label>Work email<input type="email" value={f.email} onChange={set('email')} /></label>
        <label>Username<input value={f.username} placeholder="optional" onChange={set('username')} /></label>
      </div>
      <h3 className="section">Job</h3>
      <div className="form">
        <label>Employee ID<input value={f.employeeNumber} placeholder="E0008" onChange={set('employeeNumber')} /></label>
        <label>Hire date<input type="date" value={f.hireDate} onChange={set('hireDate')} /></label>
        <label>Job title<input value={f.jobTitle} onChange={set('jobTitle')} /></label>
        {sel('department', 'Department', depts.data)}{sel('productTeam', 'Product team', teams.data, true)}
        {sel('manager', 'Reports to', people.data?.map((p) => ({ _id: p._id, name: p.name })), true)}
        {sel('location', 'Office', locs.data)}{sel('legalEntity', 'Legal entity', ents.data)}{sel('costCenter', 'Cost center', ccs.data?.map((c) => ({ _id: c._id, name: `${c.code} ${c.name}` })))}
        <label>Employment type<select value={f.employmentType} onChange={set('employmentType')}><option value="permanent">Permanent</option><option value="fixed_term">Fixed term</option><option value="contractor">Contractor</option><option value="intern">Intern</option></select></label>
        <label>Schedule<select value={f.workSchedule} onChange={set('workSchedule')}><option value="full_time">Full time</option><option value="part_time">Part time</option></select></label>
        <label>FTE<input type="number" step={0.1} min={0.1} max={1} value={f.fte} onChange={set('fte')} /></label>
      </div>
      <h3 className="section">Compensation <span className="muted">(visible to HR only)</span></h3>
      <div className="form">
        <label>Base salary<input type="number" value={f.baseSalary} onChange={set('baseSalary')} /></label>
        <label>Currency<select value={f.currency} onChange={set('currency')}><option>TRY</option><option>EUR</option><option>USD</option><option>GBP</option></select></label>
        <label>Frequency<select value={f.payFrequency} onChange={set('payFrequency')}><option value="annual">Annual</option><option value="monthly">Monthly</option><option value="hourly">Hourly</option></select></label>
      </div>
      <button disabled={!ready} onClick={hire}>Hire</button>
      {view}
    </Card>
  )
}
