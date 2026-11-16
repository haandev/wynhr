import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Avatar, Card, today, asQuery } from '../ui'
import { errorText, wyndbase } from '../wyndbase'

type Node = { _id: string; name: string | null; jobTitle: string | null; department: string | null; managerId: string | null }

/**
 * The org as a graph on a date, drawn from the top of the person's reporting line down.
 * The line from the top to the person opens on its own; clicking a box opens or closes its team,
 * and ↗ opens that person's profile. Built here from core.orgChart(asOf), because LOOP cannot
 * walk the effective `manager` link on the server (see findings).
 */
export function OrgChart({ employeeId, go }: { employeeId: string; go: (page: string, id?: string) => void }) {
  const [asOf, setAsOf] = useState(today())
  const chart = useQuery(asQuery<Node[]>(wyndbase.query.core.orgChart({ asOf })))
  const all = chart.data ?? []
  const byId = new Map(all.map((n) => [n._id, n]))
  const kids = (id: string) => all.filter((n) => n.managerId === id)

  const chain: string[] = []
  for (let cur = byId.get(employeeId); cur && chain.length < 30; cur = cur.managerId ? byId.get(cur.managerId) : undefined) chain.unshift(cur._id)
  const root = chain[0]

  const [open, setOpen] = useState<Set<string>>(new Set())
  useEffect(() => setOpen(new Set(chain)), [employeeId, chart.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // Above the person only their own line of managers is drawn: an ancestor's one child is the next
  // manager down the line, never that manager's peers. Below the person, the whole team opens.
  const focusIndex = chain.indexOf(employeeId)
  const Branch = ({ id }: { id: string }) => {
    const n = byId.get(id)!
    const at = chain.indexOf(id)
    const isAncestor = at >= 0 && at < focusIndex
    const team = isAncestor ? [byId.get(chain[at + 1])!] : kids(id)
    const isOpen = isAncestor || open.has(id)
    return (
      <li>
        <div className={`og-node ${id === employeeId ? 'focus' : ''} ${isAncestor ? 'onpath' : ''}`} onClick={() => !isAncestor && team.length && toggle(id)} role="button">
          <Avatar name={n.name} size={id === employeeId ? 48 : 40} />
          <div className="og-text">
            <strong>{n.name}</strong>
            <span>{n.jobTitle}</span>
          </div>
          <button className="og-open" title="Open profile" onClick={(e) => { e.stopPropagation(); go('person', id) }}>↗</button>
          {!isAncestor && team.length > 0 && <span className="og-toggle">{isOpen ? '−' : `+${team.length}`}</span>}
        </div>
        {isOpen && team.length > 0 && (
          <ul>{team.map((t) => <Branch key={t._id} id={t._id} />)}</ul>
        )}
      </li>
    )
  }

  return (
    <Card title="Org chart" action={
      <div className="filters">
        <button className="link" onClick={() => setOpen(new Set(all.map((n) => n._id)))}>Expand team</button>
        <button className="link" onClick={() => setOpen(new Set(chain))}>Reset</button>
        <label className="inline-label">As of <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
      </div>}>
      {chart.error && <p className="error">{errorText(chart.error)}</p>}
      {chart.data && !root && <p className="muted">Not in the organisation on this date.</p>}
      {root && (
        <div className="og-scroll">
          <ul className="og-tree"><Branch id={root} /></ul>
        </div>
      )}
      <p className="muted">Above: the reporting line up to the top. Below: the team — click a person to show or hide theirs. ↗ opens a profile. Change the date to see the org as it was.</p>
    </Card>
  )
}
