import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Admin } from './pages/Admin'
import { Home } from './pages/Home'
import { Inbox, useInbox } from './pages/Inbox'
import { People } from './pages/People'
import { Profile } from './pages/Profile'
import { Reports } from './pages/Reports'
import { TimeOff } from './pages/TimeOff'
import { Avatar, type Me } from './ui'
import { errorText, session, wyndbase } from './wyndbase'
import './App.css'

type Toast = { id: string; title: string; description?: string; ask: boolean }

export default function App() {
  const [phase, setPhase] = useState<'checking' | 'signedOut' | 'ready'>('checking')
  const [signInError, setSignInError] = useState<string>()

  useEffect(() => {
    session.handleCallback().then((r) => {
      if (r.status === 'granted') window.history.replaceState(null, '', '/')
      if (r.status === 'failed') setSignInError('Sign-in failed. Try again.')
      setPhase(wyndbase.auth.isAuthenticated() ? 'ready' : 'signedOut')
    })
  }, [])

  if (phase === 'checking') return <div className="center muted">Loading…</div>
  if (phase === 'signedOut')
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="logo">Wyn<span>HR</span></div>
          <p>Your people, time off and org in one place.</p>
          <button onClick={() => session.authorize({ redirect: true })}>Sign in with WyndBase</button>
          {signInError && <p className="error">{signInError}</p>}
        </div>
      </div>
    )
  return <Shell onSignOut={() => { wyndbase.auth.logout({ scope: 'app' }); setPhase('signedOut') }} />
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const me = useQuery(wyndbase.query.core.me())
  const [page, setPage] = useState<{ name: string; id?: string }>({ name: 'home' })
  const [toasts, setToasts] = useState<Toast[]>([])
  const inbox = useInbox()
  const waiting = inbox.data?.list.interactions?.length ?? 0
  const go = (name: string, id?: string) => {
    setPage({ name, id })
    window.scrollTo(0, 0)
  }

  // Toasts: every new inbox item (an approval asked of me, a decision on my request) pops up on
  // whatever page is open. The Inbox plugin pushes them over its channels.
  useEffect(() => {
    const sub = wyndbase.inbox.subscribe({
      onNew: (items) => {
        const fresh = items.map((i) => ({ id: i.id, title: i.title, description: i.description, ask: i.channelId === 'interactions' }))
        setToasts((t) => [...fresh, ...t].slice(0, 4))
        for (const f of fresh) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== f.id)), 8000)
      },
    })
    return () => sub.unsubscribe()
  }, [])

  const self: Me | undefined = me.data?.[0]
  const isHr = !!(self?.isHrAdmin || self?.isHrManager)
  const nav: [string, string, string, boolean][] = [
    ['home', 'Home', '⌂', true],
    ['profile', 'My profile', '☺', !!self],
    ['timeoff', 'Time off', '☀', !!self],
    ['inbox', 'Inbox', '✉', true],
    ['people', 'People', '☷', true],
    ['reports', 'Reports', '▤', isHr || !!self?.isManager],
    ['admin', 'HR admin', '⚙', isHr],
  ]
  const role = self?.isHrAdmin ? 'HR Admin' : self?.isHrManager ? 'HR Manager' : self?.isManager ? 'Manager' : 'Employee'

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">Wyn<span>HR</span></div>
        <nav>
          {nav.filter(([, , , show]) => show).map(([k, label, icon]) => (
            <button key={k} className={page.name === k || (k === 'people' && page.name === 'person') ? 'nav active' : 'nav'} onClick={() => go(k)}>
              <span className="nav-icon">{icon}</span>{label}
              {k === 'inbox' && waiting > 0 && <span className="badge">{waiting}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          {self && (
            <button className="me" onClick={() => go('profile')}>
              <Avatar name={self.name} size={36} />
              <span><strong>{self.preferredName || self.name}</strong><small>{role}</small></span>
            </button>
          )}
          <button className="link on-dark" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      <div className="toasts">
        {toasts.map((t) => (
          <div className={`toast ${t.ask ? 'toast-ask' : ''}`} key={t.id} onClick={() => { if (t.ask) go('inbox'); setToasts((x) => x.filter((y) => y.id !== t.id)) }}>
            <strong>{t.ask ? 'New request waiting for you' : 'Update'}</strong>
            <div>{t.title}</div>
            {t.description && <div className="muted">{t.description}</div>}
          </div>
        ))}
      </div>

      <main className="content">
        {me.error && <p className="error">{errorText(me.error)}</p>}
        {!self && !me.error && <p className="muted">Loading…</p>}
        {self && page.name === 'home' && <Home me={self} go={go} />}
        {self && page.name === 'profile' && <Profile employeeId={self._id} me={self} go={go} />}
        {self && page.name === 'person' && page.id && <Profile key={page.id} employeeId={page.id} me={self} go={go} />}
        {self && page.name === 'timeoff' && <TimeOff me={self} />}
        {page.name === 'inbox' && <Inbox me={self} />}
        {page.name === 'people' && <People go={go} />}
        {page.name === 'reports' && <Reports />}
        {page.name === 'admin' && isHr && <Admin />}
      </main>
    </div>
  )
}
