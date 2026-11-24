import { useState } from 'react'
import { useInstall } from '../lib/install'

const DISMISS = 'our_misses_install_dismissed'

/** How to put missu on this phone's home screen. Hidden once it's installed. */
export function InstallCard({ context, dismissible = true }: { context: 'signin' | 'game' | 'menu'; dismissible?: boolean }) {
  const { installed, ios, canPrompt, install } = useInstall()
  const [hidden, setHidden] = useState(() => {
    try { return dismissible && localStorage.getItem(DISMISS) === '1' } catch { return false }
  })
  if (installed || hidden) return null
  const dismiss = () => {
    try { localStorage.setItem(DISMISS, '1') } catch { /* ignore */ }
    setHidden(true)
  }

  return (
    <div className={`install card install-${context}`} data-testid="install">
      <p className="install-title">📲 Put missu on your home screen</p>
      {canPrompt ? (
        <>
          <p className="small">It opens like an app, full screen, and stays signed in.</p>
          <button className="pill" onClick={() => void install()}>Install missu</button>
        </>
      ) : ios ? (
        <ol className="install-steps small">
          <li>In <b>Safari</b>, tap <b>Share</b> <span aria-hidden="true">(the square with the arrow ⬆)</span>.</li>
          <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          <li>Open missu from your home screen and sign in there once. iPhone keeps home-screen apps separate from Safari.</li>
        </ol>
      ) : (
        <p className="small">Open your browser menu <b>⋮</b> and tap <b>Install app</b> or <b>Add to Home screen</b>.</p>
      )}
      {dismissible && <button className="link" onClick={dismiss}>not now</button>}
    </div>
  )
}
