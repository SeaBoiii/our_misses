import { useCallback, useEffect, useRef, useState } from 'react'
import type { Backend, Signal } from './backend'
import { HANDS_SECONDS_PER_MISS } from '../game/more'
import { buzz, sfx } from './sound'

/**
 * Hold hands: both of you hold a thumb on the screen at the same time. While you're both
 * holding, the phones beat together; every 20 seconds together is a miss each (5 a day).
 * Time is counted only while both thumbs are down, and reported when a hold ends.
 */
export function useHands({ backend, toast }: { backend: Backend; toast(text: string, tone?: 'love' | 'warn'): void }) {
  const [open, setOpen] = useState(false)
  const [partnerOpen, setPartnerOpen] = useState(false)
  const [asked, setAsked] = useState(false)
  const [meDown, setMeDown] = useState(false)
  const [partnerDown, setPartnerDown] = useState(false)
  const [heldMs, setHeldMs] = useState(0)
  const [earned, setEarned] = useState<{ today: number; cap: number } | null>(null)
  const openRef = useRef(false)
  const partnerOpenRef = useRef(false)
  const since = useRef<number | null>(null)
  const unreported = useRef(0)
  const together = meDown && partnerDown && open

  const report = useCallback(async () => {
    const seconds = Math.floor(unreported.current / 1000)
    if (seconds < HANDS_SECONDS_PER_MISS) return
    try {
      const r = await backend.hands(seconds)
      unreported.current = r.earned > 0 ? Math.max(0, unreported.current - r.earned * HANDS_SECONDS_PER_MISS * 1000) : 0
      setEarned({ today: r.today, cap: r.cap })
      if (r.earned > 0) toast(`🤝 +${r.earned} miss${r.earned > 1 ? 'es' : ''} for holding hands`, 'love')
    } catch { /* keep the time; it reports next hold */ }
  }, [backend, toast])

  // Count time only while both thumbs are down; report when that stops.
  useEffect(() => {
    if (together) {
      since.current = performance.now()
      sfx.heartbeat()
      buzz([50, 120, 50])
      const beat = setInterval(() => { sfx.heartbeat(); buzz([50, 120, 50]) }, 900)
      const clock = setInterval(() => setHeldMs((ms) => ms + 250), 250)
      return () => {
        clearInterval(beat)
        clearInterval(clock)
        if (since.current !== null) unreported.current += performance.now() - since.current
        since.current = null
        void report()
      }
    }
  }, [together, report])

  const openScreen = () => {
    sfx.unlock()
    openRef.current = true
    setOpen(true)
    setAsked(false)
    backend.signal({ type: 'hands', state: 'open' })
  }
  const close = () => {
    openRef.current = false
    setOpen(false)
    setMeDown(false)
    backend.signal({ type: 'hands', state: 'close' })
  }
  const down = () => { if (!openRef.current) return; setMeDown(true); backend.signal({ type: 'hands', state: 'down' }) }
  const up = () => { setMeDown(false); backend.signal({ type: 'hands', state: 'up' }) }

  const onSignal = useCallback((s: Signal) => {
    if (s.type !== 'hands') return
    if (s.state === 'open') {
      const wasOpen = partnerOpenRef.current
      partnerOpenRef.current = true
      setPartnerOpen(true)
      if (openRef.current && !wasOpen) backend.signal({ type: 'hands', state: 'open' }) // let them know you're here too
      if (!openRef.current) { setAsked(true); sfx.receive() }
    }
    if (s.state === 'close') { partnerOpenRef.current = false; setPartnerOpen(false); setPartnerDown(false); setAsked(false) }
    if (s.state === 'down') { partnerOpenRef.current = true; setPartnerOpen(true); setPartnerDown(true) }
    if (s.state === 'up') setPartnerDown(false)
  }, [backend])

  return { open, partnerOpen, asked, meDown, partnerDown, together, heldMs, earned, openScreen, close, down, up, onSignal, dismiss: () => setAsked(false) }
}

export type HandsApi = ReturnType<typeof useHands>
