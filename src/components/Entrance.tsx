import { useState, type FormEvent } from 'react'
import type { Player } from '../game/rules'
import { sfx } from '../lib/sound'

export function SignIn({ onSignIn }: { onSignIn(email: string, password: string): Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    sfx.unlock()
    setBusy(true)
    setError(null)
    try { await onSignIn(email.trim(), password) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in') }
    finally { setBusy(false) }
  }

  return (
    <main className="screen center">
      <h1 className="wordmark big">miss<span>u</span></h1>
      <p className="tagline">Who misses more? Only one way to find out.</p>
      <form className="card stack" onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="pill" disabled={busy}>{busy ? 'checking…' : 'Grab the rope'}</button>
        <p className="muted small">Only two people can come in. You know who you are.</p>
      </form>
    </main>
  )
}

export function DemoPicker({ onPick }: { onPick(p: Player): void }) {
  return (
    <main className="screen center">
      <h1 className="wordmark big">miss<span>u</span></h1>
      <p className="tagline">Who misses more? Only one way to find out.</p>
      <div className="card stack">
        <p><b>Demo mode.</b> Nothing is connected yet, so your partner is pretend and everything stays in this browser.</p>
        <p>Play as:</p>
        <div className="pick">
          {(['Aleem', 'Nurul'] as const).map((p) => (
            <button key={p} className={`pill pick-${p.toLowerCase()}`} onClick={() => { sfx.unlock(); onPick(p) }}>{p}</button>
          ))}
        </div>
      </div>
    </main>
  )
}
