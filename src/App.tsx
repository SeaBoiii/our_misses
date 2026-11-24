import { useCallback, useEffect, useState } from 'react'
import type { Backend } from './lib/backend'
import { clearDemo, demoBackend } from './lib/demo'
import { liveBackend, liveConfigured, NotMemberError, supabase } from './lib/live'
import { Game } from './components/Game'
import { DemoPicker, SignIn } from './components/Entrance'
import type { Player } from './game/rules'

const DEMO_PLAYER = 'our_misses_demo_player'
const LAST_EMAIL = 'our_misses_email'

/**
 * Live mode. Sign in once per phone: the session is kept on the device and refreshed quietly,
 * so every later open goes straight to the rope. If the phone is offline when it opens, it
 * says so and retries rather than asking you to sign in again.
 */
function LiveApp() {
  const [backend, setBackend] = useState<Backend | null>(null)
  const [state, setState] = useState<'checking' | 'signin' | 'offline' | 'ready'>('checking')

  const connect = useCallback(async () => {
    try {
      setBackend(await liveBackend())
      setState('ready')
    } catch (e) {
      if (e instanceof NotMemberError) await supabase().auth.signOut()
      throw e
    }
  }, [])

  const resume = useCallback(async () => {
    setState('checking')
    const { data } = await supabase().auth.getSession()
    if (!data.session) { setState('signin'); return }
    try { await connect() } catch (e) { setState(e instanceof NotMemberError ? 'signin' : 'offline') }
  }, [connect])

  useEffect(() => { void resume() }, [resume])

  if (state === 'checking') return <main className="screen center"><p className="loading">finding the rope…</p></main>
  if (state === 'offline') {
    return (
      <main className="screen center">
        <div className="card stack">
          <p>Can’t reach the rope right now. Check your connection.</p>
          <button className="pill" onClick={() => void resume()}>Try again</button>
        </div>
      </main>
    )
  }
  if (state === 'signin' || !backend) {
    return (
      <SignIn
        rememberedEmail={(() => { try { return localStorage.getItem(LAST_EMAIL) ?? '' } catch { return '' } })()}
        onSignIn={async (email, password) => {
          const { error } = await supabase().auth.signInWithPassword({ email, password })
          if (error) throw new Error(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message)
          try { localStorage.setItem(LAST_EMAIL, email) } catch { /* ignore */ }
          await connect()
        }}
      />
    )
  }
  return <Game backend={backend} onLeave={() => { void backend.signOut?.().then(() => { setBackend(null); setState('signin') }) }} />
}

function DemoApp() {
  const [player, setPlayer] = useState<Player | null>(() => {
    try { return (localStorage.getItem(DEMO_PLAYER) as Player | null) ?? null } catch { return null }
  })
  const [backend, setBackend] = useState<Backend | null>(() => (player ? demoBackend(player) : null))

  if (!player || !backend) {
    return <DemoPicker onPick={(p) => {
      try { localStorage.setItem(DEMO_PLAYER, p) } catch { /* ignore */ }
      if (p !== player) clearDemo()
      setPlayer(p)
      setBackend(demoBackend(p))
    }} />
  }
  return <Game key={player} backend={backend} onLeave={() => setBackend(null)} />
}

export function App() {
  return liveConfigured ? <LiveApp /> : <DemoApp />
}
