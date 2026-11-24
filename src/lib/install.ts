// Installing missu on a phone. Android/Chrome offers a real install prompt (captured early in
// main.tsx); iPhone needs Safari's Share → Add to Home Screen, so we explain that instead.
import { useEffect, useState } from 'react'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
declare global {
  interface Window { __missuInstall?: InstallPrompt | null }
}

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    window.__missuInstall = e as InstallPrompt
    window.dispatchEvent(new Event('missu-installable'))
  })
  window.addEventListener('appinstalled', () => {
    window.__missuInstall = null
    window.dispatchEvent(new Event('missu-installable'))
  })
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function useInstall() {
  const [prompt, setPrompt] = useState(() => window.__missuInstall ?? null)
  const [installed, setInstalled] = useState(isStandalone)
  useEffect(() => {
    const update = () => { setPrompt(window.__missuInstall ?? null); setInstalled(isStandalone()) }
    window.addEventListener('missu-installable', update)
    const media = window.matchMedia('(display-mode: standalone)')
    media.addEventListener?.('change', update)
    return () => {
      window.removeEventListener('missu-installable', update)
      media.removeEventListener?.('change', update)
    }
  }, [])
  return {
    installed,
    ios: isIos(),
    canPrompt: Boolean(prompt),
    async install() {
      if (!prompt) return false
      await prompt.prompt()
      const choice = await prompt.userChoice
      window.__missuInstall = null
      setPrompt(null)
      return choice.outcome === 'accepted'
    },
  }
}
