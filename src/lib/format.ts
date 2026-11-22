const pad = (n: number) => String(n).padStart(2, '0')

/** 2d 4h · 3h 12m · 12:03 */
export function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}:${pad(s % 60)}`
}

export function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86_400)}d ago`
}

export function weekLabel(weekStart: string) {
  const d = new Date(`${weekStart}T00:00:00Z`)
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
