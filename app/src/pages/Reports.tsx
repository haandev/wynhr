import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ExportMenu } from '../ExportMenu'
import { Card, Pill, Table, fmtShort, hrs } from '../ui'
import { wyndbase } from '../wyndbase'

export function Reports() {
  const y = new Date().getFullYear()
  const [range, setRange] = useState({ from: `${y}-01-01`, to: `${y}-12-31` })
  const [tab, setTab] = useState('balances')
  const balances = useQuery(wyndbase.query.pto.balances({ employee: null }))
  const avail = useQuery(wyndbase.query.pto.availability({ from: range.from, to: range.to, department: null, location: null }))
  const summary = useQuery(wyndbase.query.pto.leaveSummary({ from: range.from, to: range.to }))
  const usage = useQuery(wyndbase.query.pto.usageHistory({ from: range.from, to: range.to, department: null, location: null, status: null }))
  const R = (x: unknown) => x as Record<string, unknown>[] | undefined
  const tabs: [string, string][] = [['balances', 'PTO balances'], ['calendar', 'Availability'], ['summary', 'Leave summary'], ['usage', 'Usage history']]
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Reports</h1>
        <div className="filters">
          <label>From<input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label>To<input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        </div>
      </div>
      <nav className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {tab === 'balances' && (
        <Card title="PTO balances" action={<ExportMenu report="pto.balances" title="PTO balances" empty={!balances.data?.length} load={(format) => wyndbase.mutation.audit.exportBalances({ format })} filters={{ asOf: new Date().toISOString().slice(0, 10) }} />}>
          <Table rows={R(balances.data)} cols={[['employeeName', 'Employee'], ['department', 'Department'], ['location', 'Office'], ['policyName', 'Policy'], ['accrued', 'Accrued', hrs], ['used', 'Used', hrs], ['adjusted', 'Adjusted', hrs], ['remaining', 'Remaining', hrs], ['pending', 'Pending', hrs], ['projected', 'Projected', hrs]]} />
        </Card>
      )}
      {tab === 'calendar' && (
        <Card title="Availability calendar" action={<ExportMenu report="pto.availability" title="Availability calendar" empty={!avail.data?.length} load={(format) => wyndbase.mutation.audit.exportAvailability({ format, ...range, department: null, location: null })} filters={{ ...range }} />}>
          <Table rows={R(avail.data)} cols={[['startDate', 'From', (v) => fmtShort(String(v))], ['endDate', 'To', (v) => fmtShort(String(v))], ['employeeName', 'Who / holiday'], ['ptoType', 'Type'], ['country', 'Country'], ['status', 'Status', (v) => <Pill s={v} />]]} />
        </Card>
      )}
      {tab === 'summary' && (
        <Card title="Leave summary by department" action={<ExportMenu report="pto.leaveSummary" title="Leave summary" empty={!summary.data?.length} load={(format) => wyndbase.mutation.audit.exportLeaveSummary({ format, ...range })} filters={{ ...range }} />}>
          <Table rows={R(summary.data)} cols={[['department', 'Department'], ['productTeam', 'Product team'], ['approvedHours', 'Approved h', hrs], ['pendingHours', 'Pending h', hrs], ['requests', 'Requests']]} />
        </Card>
      )}
      {tab === 'usage' && (
        <Card title="PTO usage history" action={<ExportMenu report="pto.usageHistory" title="PTO usage history" empty={!usage.data?.length} load={(format) => wyndbase.mutation.audit.exportUsageHistory({ format, ...range, department: null, location: null, status: null })} filters={{ ...range }} />}>
          <Table rows={R(usage.data)} cols={[['entryDate', 'Date', (v) => fmtShort(String(v))], ['employeeName', 'Employee'], ['department', 'Department'], ['policy', 'Policy'], ['hours', 'Hours', hrs], ['reason', 'Reason']]} />
        </Card>
      )}
      <p className="muted">Every export is recorded in the audit log with who exported what, when, and with which filters.</p>
    </>
  )
}
