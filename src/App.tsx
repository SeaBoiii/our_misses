import { useCallback, useEffect, useState } from 'react'
import type { Backend } from './lib/backend'
import { clearDemo, demoBackend } from './lib/demo'
import { liveBackend, liveConfigured, NotMemberError, supabase } from './lib/live'
import { Game } from './components/Game'
import { DemoPicker, SignIn } from './components/Entrance'
import type { Player } from './game/rules'

const DEMO_PLAYER = 'our_misses_demo_player'

function LiveApp() {
  const [backend, setBackend] = useState<Backend | null>(null)
  const [checked, setChecked] = useState(false)

  const connect = useCallback(async () => {
    try { setBackend(await liveBackend()) }
    catch (e) {
      if (e instanceof NotMemberError) await supabase().auth.signOut()
      throw e
    }
  }, [])

  useEffect(() => {
    supabase().auth.getSession().then(async ({ data }) => {
      if (data.session) await connect().catch(() => undefined)
      setChecked(true)
    })
  }, [connect])

  if (!checked) return <main className="screen center"><p className="loading">finding the rope…</p></main>
  if (!backend) {
    return (
      <SignIn onSignIn={async (email, password) => {
        const { error } = await supabase().auth.signInWithPassword({ email, password })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message)
        await connect()
      }} />
    )
  }
  return <Game backend={backend} onLeave={() => { void backend.signOut?.().then(() => setBackend(null)) }} />
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
