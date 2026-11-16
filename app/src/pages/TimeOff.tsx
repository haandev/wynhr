import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Pill, Table, days, fmtShort, hrs, today, useNotice, type Me } from '../ui'
import { wyndbase } from '../wyndbase'

export function TimeOff({ me }: { me: Me }) {
  const balances = useQuery(wyndbase.query.pto.balances({ employee: me._id }))
  const requests = useQuery(wyndbase.query.pto.myRequests())
  const [form, setForm] = useState({ policy: '', startDate: today(), endDate: today(), hours: '8', partialDay: false, note: '' })
  const { run, view } = useNotice()

  return (
    <>
      <h1 className="page-title">Time off</h1>
      <div className="grid-2">
        {balances.data?.map((b) => (
          <Card key={String(b.policy)} className="balance-card">
            <div className="balance-card-head">
              <div className={`balance-icon bi-${String(b.ptoType).toLowerCase().split(' ')[0]}`}>{String(b.ptoType).startsWith('Sick') ? '✚' : '☀'}</div>
              <div><strong>{b.ptoType}</strong><div className="muted">{b.policyName}</div></div>
            </div>
            <div className="big-number">{days(b.projected)}<span> days available</span></div>
            <div className="meter"><div style={{ width: `${Math.min(100, (Number(b.used) / Math.max(1, Number(b.accrued))) * 100)}%` }} /></div>
            <div className="stats">
              <div><span>{hrs(b.remaining)}</span>hours left</div>
              <div><span>{hrs(b.used)}</span>used</div>
              <div><span>{hrs(b.pending)}</span>pending</div>
              <div><span>{hrs(b.accrued)}</span>accrued</div>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Request time off">
        <div className="form">
          <label>Type
            <select value={form.policy} onChange={(e) => setForm({ ...form, policy: e.target.value })}>
              <option value="">Choose…</option>
              {balances.data?.map((b) => <option key={String(b.policy)} value={String(b.policy)}>{b.ptoType} ({b.policyName})</option>)}
            </select>
          </label>
          <label>From<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.partialDay || e.target.value > form.endDate ? e.target.value : form.endDate })} /></label>
          <label>To<input type="date" value={form.endDate} disabled={form.partialDay} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          <label>Hours<input type="number" min={2} step={0.5} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={form.partialDay} onChange={(e) => setForm({ ...form, partialDay: e.target.checked, endDate: form.startDate })} /> Partial day (min. 2 h)</label>
          <label className="wide">Note for your manager<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        </div>
        <button disabled={!form.policy} onClick={() => run(() => wyndbase.mutation.pto.submitRequest({ ...form, hours: Number(form.hours) }), 'Request sent. Your manager has it in their inbox.')}>Send request</button>
        {view}
      </Card>

      <Card title="My requests">
        <Table
          rows={requests.data as Record<string, unknown>[] | undefined}
          empty="You haven't requested time off yet."
          cols={[
            ['ptoType', 'Type'],
            ['startDate', 'Dates', (v, r) => `${fmtShort(String(v))}${r.endDate !== v ? ` – ${fmtShort(String(r.endDate))}` : ''}`],
            ['hours', 'Hours', hrs], ['status', 'Status', (v) => <Pill s={v} />], ['decidedBy', 'Decided by'], ['decisionNote', 'Note'],
            ['_id', '', (v, r) => r.status === 'pending' ? <button className="link" onClick={() => run(() => wyndbase.mutation.pto.cancelMyRequest({ id: String(v) }), 'Request canceled.')}>Cancel</button> : null],
          ]}
        />
      </Card>
    </>
  )
}
