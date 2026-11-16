import { QueryObserver } from '@tanstack/query-core'
import type { InboxData } from '@wyndbase/sdk/plugins/inbox'
import { useEffect, useState } from 'react'
import { Card, useNotice, type Me } from '../ui'
import { Delegation } from './Delegation'
import { errorText, wyndbase } from '../wyndbase'

/** The account inbox through the SDK's Inbox plugin: items arrive over its channels. */
export function useInbox() {
  const [state, setState] = useState<{ data?: InboxData; error?: string }>({})
  useEffect(() => {
    const observer = new QueryObserver(wyndbase.queryClient, wyndbase.inbox.all.options() as never)
    return observer.subscribe((r) => setState({ data: r.data as InboxData | undefined, error: r.error ? errorText(r.error) : undefined }))
  }, [])
  return state
}

export function Inbox({ me }: { me?: Me }) {
  const inbox = useInbox()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const { run, view } = useNotice()
  const asks = inbox.data?.list.interactions ?? []
  const updates = [...(inbox.data?.list.assignments ?? []), ...(inbox.data?.list.mentions ?? []), ...(inbox.data?.list.alerts ?? [])]
  const answer = (id: string, decision: 'approve' | 'deny') =>
    run(() => wyndbase.mutation.system.answerInteraction({ interactionId: id, response: { decision, note: notes[id] ?? '' } }), decision === 'approve' ? 'Approved.' : 'Denied.')

  return (
    <>
      <h1 className="page-title">Inbox</h1>
      {me && <Delegation me={me} />}
      <Card title={`Waiting for my decision${asks.length ? ` (${asks.length})` : ''}`}>
        {inbox.error && <p className="error">{inbox.error}</p>}
        {!asks.length && <p className="muted">You're all caught up. 🎉</p>}
        {asks.map((i) => {
          const id = i.target?.kind === 'interaction' ? i.target.interactionId : i.id
          return (
            <div className="ask" key={i.id}>
              <div className="ask-icon">☀</div>
              <div className="ask-body"><strong>{i.title}</strong><div className="muted">{i.description}</div></div>
              <input placeholder="Note (optional)" value={notes[id] ?? ''} onChange={(e) => setNotes({ ...notes, [id]: e.target.value })} />
              <button onClick={() => answer(id, 'approve')}>Approve</button>
              <button className="secondary" onClick={() => answer(id, 'deny')}>Deny</button>
            </div>
          )
        })}
        {view}
      </Card>
      <Card title="Updates">
        {!updates.length && <p className="muted">No updates.</p>}
        {updates.map((u) => (
          <div className="ask" key={u.id}>
            <div className="ask-icon ok">✓</div>
            <div className="ask-body"><strong>{u.title}</strong>{u.description && <div className="muted">{u.description}</div>}</div>
            <span className="muted">{u.actor} · {new Date(u.occurredAt).toLocaleString()}</span>
          </div>
        ))}
      </Card>
    </>
  )
}
