import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Backend, Signal } from './backend'
import { NoHeartsError, type Duel, type MissEvent, type Player, type ProveStart, type ProveStatus, type SendResult, type Status, type WeekTotal } from '../game/rules'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
export const liveConfigured = Boolean(url && key)
if (key && !key.startsWith('sb_publishable_')) {
  throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key (sb_publishable_…).')
}

let client: SupabaseClient | null = null
export function supabase() {
  client ??= createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'our_misses_auth' } })
  return client
}

export class NotMemberError extends Error {}

function fail(error: { code?: string; message: string; hint?: string | null }): never {
  if (error.code === 'P0001' && error.message.includes('no hearts')) throw new NoHeartsError(error.hint ?? null)
  if (error.code === '42501') throw new NotMemberError('This account is not one of the two players.')
  throw new Error(error.message)
}

export async function liveBackend(): Promise<Backend> {
  const db = supabase()
  const first = await db.rpc('our_misses_status')
  if (first.error) fail(first.error)
  const me = (first.data as Status).me
  let room: RealtimeChannel | null = null
  const call = async <T,>(fn: string, args?: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args)
    if (error) fail(error)
    return data as T
  }

  return {
    kind: 'live',
    me,
    async status() {
      const { data, error } = await db.rpc('our_misses_status')
      if (error) fail(error)
      return data as Status
    },
    async weekEvents(sinceIso) {
      const { data, error } = await db.from('our_misses_events').select('*').gte('created_at', sinceIso).order('id')
      if (error) fail(error)
      return data as MissEvent[]
    },
    async weeks() {
      const { data, error } = await db.rpc('our_misses_weeks')
      if (error) fail(error)
      return data as WeekTotal[]
    },
    async send(charge, seenId) {
      const { data, error } = await db.rpc('our_misses_send', { p_charge: charge, p_seen_id: seenId })
      if (error) fail(error)
      return data as SendResult
    },
    proveToday: () => call<ProveStatus>('our_misses_prove_today'),
    proveStart: (level) => call<ProveStart>('our_misses_prove_start', { p_level: level }),
    proveFinish: (score) => call<ProveStatus>('our_misses_prove_finish', { p_score: score }),
    duelStart: (game) => call<Duel>('our_misses_duel_start', { p_game: game }),
    duelFinish: (id, value, solved = false) => call<Duel>('our_misses_duel_finish', { p_id: id, p_score: value, p_solved: solved }),
    duelGet: (id) => call<Duel>('our_misses_duel_get', { p_id: id }),
    signal(s) {
      void room?.send({ type: 'broadcast', event: 'signal', payload: s })
    },
    subscribe(onEvent, onPresence, onSignal) {
      let closed = false
      const channel = db.channel('our_misses:room', { config: { private: true, presence: { key: me } } })
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'our_misses_events' }, (payload) => onEvent(payload.new as MissEvent))
        .on('presence', { event: 'sync' }, () => onPresence(Object.keys(channel.presenceState()) as Player[]))
        .on('broadcast', { event: 'signal' }, ({ payload }) => onSignal(payload as Signal))
      room = channel
      const track = () => {
        if (document.visibilityState === 'visible') void channel.track({ since: Date.now() })
        else void channel.untrack()
      }
      void db.realtime.setAuth().then(() => {
        if (closed) return
        channel.subscribe((state) => { if (state === 'SUBSCRIBED') track() })
      })
      document.addEventListener('visibilitychange', track)
      return () => {
        closed = true
        room = null
        document.removeEventListener('visibilitychange', track)
        void db.removeChannel(channel)
      }
    },
    async signOut() {
      await db.auth.signOut()
    },
  }
}
