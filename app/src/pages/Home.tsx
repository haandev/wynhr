import { useQuery } from '@tanstack/react-query'
import { Avatar, Card, days, fmtShort, type Me } from '../ui'
import { wyndbase } from '../wyndbase'

const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

/** Next work anniversary within `within` days of today, or null. */
function anniversary(hireDate: string, within: number) {
  const now = new Date()
  const h = new Date(hireDate + 'T00:00:00')
  const next = new Date(now.getFullYear(), h.getMonth(), h.getDate())
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1)
  const inDays = Math.round((next.getTime() - now.getTime()) / 86400000)
  const years = next.getFullYear() - h.getFullYear()
  return inDays <= within && years > 0 ? { date: next.toISOString().slice(0, 10), years } : null
}

export function Home({ me, go }: { me: Me; go: (page: string, id?: string) => void }) {
  const balances = useQuery(wyndbase.query.pto.balances({ employee: me._id }))
  const out = useQuery(wyndbase.query.pto.whosOut({ from: addDays(0), to: addDays(14) }))
  const team = useQuery(wyndbase.query.core.myTeam())
  const people = useQuery(wyndbase.query.core.directory({ department: null, location: null, status: null }))
  const requests = useQuery(wyndbase.query.pto.myRequests())
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const celebrations = (people.data ?? [])
    .map((p) => ({ p, a: anniversary(p.hireDate, 30) }))
    .filter((x) => x.a)
    .sort((x, y) => x.a!.date.localeCompare(y.a!.date))
  const pending = (requests.data ?? []).filter((r) => r.status === 'pending')

  return (
    <>
      <div className="hero">
        <Avatar name={me.name} size={64} />
        <div>
          <div className="hero-greet">{greet}, {me.preferredName || me.name?.split(' ')[0]}</div>
          <div className="hero-sub">{me.jobTitle} · {me.department} · {me.location}</div>
        </div>
        <div className="hero-actions">
          <button onClick={() => go('timeoff')}>Request time off</button>
          <button className="secondary on-dark" onClick={() => go('profile')}>My profile</button>
        </div>
      </div>

      <div className="grid-3">
        <Card title="Time off">
          <div className="balance-list">
            {balances.data?.map((b) => (
              <div className="balance" key={String(b.policy)}>
                <div className={`balance-icon bi-${String(b.ptoType).toLowerCase().split(' ')[0]}`}>{String(b.ptoType).startsWith('Sick') ? '✚' : '☀'}</div>
                <div>
                  <div className="balance-days">{days(b.projected)} <span>days available</span></div>
                  <div className="muted">{b.ptoType} · {Number(b.pending) > 0 ? `${days(b.pending)} d pending` : 'nothing pending'}</div>
                </div>
              </div>
            ))}
          </div>
          {pending.length > 0 && <p className="muted">You have {pending.length} request{pending.length > 1 ? 's' : ''} waiting for approval.</p>}
          <button className="link" onClick={() => go('timeoff')}>See details →</button>
        </Card>

        <Card title="Who's out" action={<span className="muted">next 2 weeks</span>}>
          {!out.data?.length && <p className="muted">Everyone's in.</p>}
          {out.data?.map((o) => (
            <div className="person-row" key={o._id}>
              <Avatar name={o.name} size={32} />
              <div>
                <button className="link strong" onClick={() => go('person', String(o.employeeId))}>{o.name}</button>
                <div className="muted">{fmtShort(o.startDate)}{o.endDate !== o.startDate ? ` – ${fmtShort(o.endDate)}` : ''} · {o.department}</div>
              </div>
            </div>
          ))}
        </Card>

        <Card title="Celebrations" action={<span className="muted">next 30 days</span>}>
          {!celebrations.length && <p className="muted">No work anniversaries coming up.</p>}
          {celebrations.map(({ p, a }) => (
            <div className="person-row" key={p._id}>
              <Avatar name={p.name} size={32} />
              <div>
                <button className="link strong" onClick={() => go('person', p._id)}>{p.name}</button>
                <div className="muted">🎉 {a!.years} year{a!.years > 1 ? 's' : ''} on {fmtShort(a!.date)}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {!!team.data?.length && (
        <Card title="My team" action={<span className="muted">{team.data.length} direct report{team.data.length > 1 ? 's' : ''}</span>}>
          <div className="people-grid">
            {team.data.map((t) => (
              <button className="person-card" key={t._id} onClick={() => go('person', t._id)}>
                <Avatar name={t.name} size={48} />
                <strong>{t.name}</strong>
                <span className="muted">{t.jobTitle}</span>
                <span className="muted">{t.location}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}
