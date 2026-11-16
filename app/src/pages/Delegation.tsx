import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, Pill, fmtDate, today, useNotice, type Me } from '../ui'
import { wyndbase } from '../wyndbase'

/** The decision key a manager lends: answering time-off approvals addressed to them. */
const APPROVALS_KEY = 'pto.request_approval.interaction.ask.answer'

const addDays = (d: string, n: number) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)

/**
 * Approval delegation through WyndBase's authority delegation: the manager lends their approval key
 * for a period (auth.createDelegation). While it is in force the delegate is asked, in their inbox,
 * exactly what the manager would be asked — no more — and can never approve their own request.
 */
export function Delegation({ me }: { me: Me }) {
  const account = useQuery(wyndbase.query.auth.getMe())
  const userId = account.data?.[0]?._id
  const granted = useQuery({ ...wyndbase.query.auth.listGrantedDelegations({ userId: userId ?? '' }).options(), enabled: !!userId })
  const received = useQuery({ ...wyndbase.query.auth.listReceivedDelegations({ userId: userId ?? '' }).options(), enabled: !!userId })
  const people = useQuery(wyndbase.query.core.directory({ department: null, location: null, status: null }))
  const [f, setF] = useState({ delegate: '', from: today(), until: addDays(today(), 7) })
  const { run, view } = useNotice()
  const nameOf = (uid?: string | null) => people.data?.find((p) => p.userId === uid)?.name ?? uid ?? '–'
  const state = (d: { startsAt: string | null; endsAt: string | null; revokedAt: string | null }) => {
    const now = Date.now()
    if (d.revokedAt) return <Pill s="canceled" />
    if (d.endsAt && Date.parse(d.endsAt) <= now) return <span className="pill">Ended</span>
    if (d.startsAt && Date.parse(d.startsAt) > now) return <span className="pill pill-pending">Scheduled</span>
    return <Pill s="active" />
  }
  const approvals = <T extends { key: string | null }>(rows?: T[]) => (rows ?? []).filter((d) => d.key === APPROVALS_KEY)

  return (
    <>
      {me.canDelegate && (
        <Card title="Delegate my approvals" action={<span className="muted">for when you are away</span>}>
          <p className="muted">The person you choose is asked to approve or deny time-off requests that would come to you, in their inbox, for the period you set. They see only requests addressed to you, and nobody can approve their own request.</p>
          <div className="form">
            <label>Delegate to<select value={f.delegate} onChange={(e) => setF({ ...f, delegate: e.target.value })}>
              <option value="">Choose…</option>
              {people.data?.filter((p) => p.userId && p.userId !== userId).map((p) => <option key={p._id} value={String(p.userId)}>{p.name} · {p.jobTitle}</option>)}
            </select></label>
            <label>From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
            <label>Until (inclusive)<input type="date" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} /></label>
          </div>
          <button disabled={!f.delegate || f.until < f.from} onClick={() => run(() => wyndbase.mutation.auth.createDelegation({
            key: APPROVALS_KEY, delegateId: f.delegate, delegatorId: null,
            startsAt: `${f.from}T00:00:00Z`, endsAt: `${addDays(f.until, 1)}T00:00:00Z`,
          }), `Delegated to ${nameOf(f.delegate)} from ${fmtDate(f.from)} to ${fmtDate(f.until)}.`)}>Delegate</button>
          <div className="delegations">
            {approvals(granted.data).map((d) => (
              <div className="contact-row" key={d._id}>
                <div><strong>{nameOf(d.delegateId)}</strong> <span className="muted">{fmtDate(d.startsAt)} → {fmtDate(d.endsAt ? addDays(d.endsAt.slice(0, 10), -1) : null)}</span></div>
                <span>{state(d)} {!d.revokedAt && d.endsAt && Date.parse(d.endsAt) > Date.now() && <button className="link" onClick={() => run(() => wyndbase.mutation.auth.revokeMyDelegation({ _id: d._id }), 'Delegation revoked.')}>Revoke</button>}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {approvals(received.data).length > 0 && (
        <Card title="Approvals delegated to me">
          {approvals(received.data).map((d) => (
            <div className="contact-row" key={d._id}>
              <div><strong>{nameOf(d.delegatorId)}</strong> <span className="muted">asked you to cover {fmtDate(d.startsAt)} → {fmtDate(d.endsAt ? addDays(d.endsAt.slice(0, 10), -1) : null)}</span></div>
              <span>{state(d)} {!d.revokedAt && d.endsAt && Date.parse(d.endsAt) > Date.now() && <button className="link" onClick={() => run(() => wyndbase.mutation.auth.declineDelegation({ _id: d._id }), 'Declined.')}>Decline</button>}</span>
            </div>
          ))}
        </Card>
      )}
      {view}
    </>
  )
}
