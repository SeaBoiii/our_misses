/* Runs the real migration in PGlite (actual PostgreSQL) with Supabase's trusted JWT
 * functions, roles and realtime schema stubbed, then plays a scripted week of misses.
 * No live project, network or credentials. */
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const ALEEM = '11111111-1111-4111-8111-111111111111'
const NURUL = '22222222-2222-4222-8222-222222222222'
const OUTSIDER = '33333333-3333-4333-8333-333333333333'
let checks = 0

const ms = (minutes) => minutes * 60_000
// Sunday 23:50 in Singapore, so the first misses land in last week's season.
const T0 = Date.parse('2026-11-22T15:50:00Z')

async function as(role, id = null) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role, ...(id ? { sub: id } : {}) })])
  if (role) await db.exec(`set role ${role}`)
}
async function at(time) {
  await db.query("select set_config('test.now', $1, false)", [new Date(time).toISOString()])
}
async function fails(sql, values = [], code = '42501') {
  let error
  try { await db.query(sql, values) } catch (e) { error = e }
  assert.ok(error, `Expected failure ${code}: ${sql}`)
  assert.equal(error.code, code, `${sql} failed with ${error.code}: ${error.message}`)
  checks++
  return error
}
async function send(charge, seen = 0) {
  return (await db.query('select public.our_misses_send($1, $2) as r', [charge, seen])).rows[0].r
}
async function status() {
  return (await db.query('select public.our_misses_status() as r')).rows[0].r
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    $$;
    grant usage on schema auth to public;
    create schema realtime;
    create table realtime.messages (id bigint generated always as identity primary key, topic text);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable as $$ select 'our_misses:room' $$;
    grant usage on schema realtime to public;
    insert into auth.users values ('${ALEEM}'), ('${NURUL}'), ('${OUTSIDER}');
  `)
  const dir = new URL('../supabase/migrations/', import.meta.url)
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, dir), 'utf8'))
  }
  // Move time from the test instead of the transaction clock.
  await db.exec(`
    create or replace function our_misses_private.clock() returns timestamptz
    language sql stable set search_path = '' as $$ select current_setting('test.now')::timestamptz $$;
  `)
  await db.query('update public.our_misses_hearts set refilled_at = $1', [new Date(T0 - ms(60)).toISOString()])
  await at(T0)

  const policies = (await db.query("select policyname from pg_policies where schemaname = 'realtime' order by 1")).rows
  assert.deepEqual(policies.map((p) => p.policyname), ['our_misses members join the room', 'our_misses members read the room'])
  checks++

  // Fails closed until both members are allowlisted.
  await as('authenticated', ALEEM)
  await fails('select public.our_misses_status()')
  await fails('select public.our_misses_send(1, 0)')
  assert.equal((await db.query('select * from public.our_misses_events')).rows.length, 0)
  await as(null)
  await db.query("insert into public.our_misses_members values ('Aleem', $1), ('Nurul', $2)", [ALEEM, NURUL])
  await fails("insert into public.our_misses_members values ('Someone', $1)", [OUTSIDER], '23514')

  // Strangers get nothing.
  await as('anon')
  await fails('select * from public.our_misses_events')
  await fails('select public.our_misses_status()')
  await fails('select public.our_misses_send(3, 0)')
  await fails('select * from public.our_misses_weeks()')
  await as('authenticated', OUTSIDER)
  await fails('select public.our_misses_status()')
  await fails('select public.our_misses_send(3, 0)')
  assert.equal((await db.query('select * from public.our_misses_events')).rows.length, 0)
  assert.equal((await db.query('select * from public.our_misses_members')).rows.length, 0)
  assert.equal((await db.query('select * from public.our_misses_hearts')).rows.length, 0)
  checks += 3

  // Members can read but never write directly.
  await as('authenticated', ALEEM)
  const s0 = await status()
  assert.equal(s0.me, 'Aleem')
  assert.equal(s0.week_start, '2026-11-16')
  assert.deepEqual(s0.hearts.Aleem, { hearts: 3, next_at: null })
  await fails("insert into public.our_misses_events (player, kind, charge, rally_length, points, created_at) values ('Aleem','miss',3,1,3,now())")
  await fails('update public.our_misses_hearts set stored = 3')
  await fails('delete from public.our_misses_events')
  await fails("update public.our_misses_members set player = 'Nurul'")
  await fails('select public.our_misses_send(4, 0)', [], '22023')
  await fails('select public.our_misses_send(0, 0)', [], '22023')
  checks += 3

  // A rally across midnight on Sunday.
  const a1 = await send(3)
  assert.equal(a1.events.length, 1)
  assert.deepEqual({ ...a1.events[0], id: 0, created_at: 0 }, { id: 0, created_at: 0, player: 'Aleem', kind: 'miss', charge: 3, rally_length: 1, rally_bonus: 0, points: 3, ref_id: null })
  assert.equal(a1.hearts.hearts, 2)
  assert.equal(Date.parse(a1.hearts.next_at), T0 + ms(30))
  checks += 3

  await as('authenticated', NURUL)
  await at(T0 + ms(2))
  const n1 = await send(2, a1.events[0].id)
  assert.equal(n1.events.length, 1, 'A reply to a miss already seen is not a Same Brain.')
  assert.equal(n1.events[0].rally_length, 2)
  assert.equal(n1.events[0].rally_bonus, 1)
  assert.equal(n1.events[0].points, 3)
  checks += 4

  await as('authenticated', ALEEM)
  await at(T0 + ms(4))
  const a2 = await send(1, n1.events[0].id)
  assert.equal(a2.events[0].rally_length, 3)
  assert.equal(a2.events[0].rally_bonus, 2)
  assert.equal(a2.hearts.hearts, 1)
  await at(T0 + ms(5))
  const a3 = await send(1, n1.events[0].id)
  assert.equal(a3.events[0].rally_length, 3, 'Sending twice keeps the rally alive without a bonus.')
  assert.equal(a3.events[0].rally_bonus, 0)
  assert.equal(a3.hearts.hearts, 0)
  assert.equal(Date.parse(a3.hearts.next_at), T0 + ms(30))
  checks += 6

  // Out of hearts until the next one arrives.
  await at(T0 + ms(10))
  const empty = await fails('select public.our_misses_send(1, 0)', [], 'P0001')
  assert.equal(Date.parse(empty.hint), T0 + ms(30))
  await at(T0 + ms(31))
  assert.deepEqual((await status()).hearts.Aleem.hearts, 1)
  assert.equal((await status()).week_start, '2026-11-23', 'Monday 00:00 Singapore starts a new season.')
  const a4 = await send(2, n1.events[0].id)
  assert.equal(a4.events[0].rally_length, 1, 'A miss after the 5 minute window starts a new rally.')
  assert.equal(a4.hearts.hearts, 0)
  assert.equal(Date.parse(a4.hearts.next_at), T0 + ms(60), 'Partial refill progress is kept.')
  checks += 5

  // Same Brain: both send within 60 s without having seen the other's.
  const T1 = T0 + ms(180)
  await as('authenticated', NURUL)
  await at(T1)
  const n2 = await send(1, a4.events[0].id)
  assert.equal(n2.events.length, 1)
  assert.equal(n2.hearts.hearts, 3 - 1)
  await as('authenticated', ALEEM)
  await at(T1 + 20_000)
  const a5 = await send(3, n1.events[0].id)
  assert.equal(a5.events.length, 3)
  const [miss, mine, theirs] = a5.events
  assert.equal(miss.rally_length, 2)
  assert.equal(miss.points, 4)
  assert.deepEqual([mine.player, mine.kind, mine.points, mine.ref_id], ['Aleem', 'same_brain', 3, miss.id])
  assert.deepEqual([theirs.player, theirs.kind, theirs.points, theirs.ref_id], ['Nurul', 'same_brain', 3, n2.events[0].id])
  checks += 6

  // Each miss pairs once, and a miss older than 60 s never pairs.
  await as('authenticated', NURUL)
  await at(T1 + 40_000)
  const n3 = await send(1, 0)
  assert.equal(n3.events.length, 1)
  assert.equal(n3.events[0].points, 1 + 2, 'Third volley of the rally earns +2.')
  await as('authenticated', ALEEM)
  await at(T1 + 140_000)
  const a6 = await send(1, 0)
  assert.equal(a6.events.length, 1)
  assert.equal(a6.events[0].points, 1 + 3, 'Fourth volley earns +3.')
  checks += 4

  // The history board: points, misses, Same Brains and longest rally per Singapore week.
  const weeks = (await db.query('select week_start, aleem, nurul, aleem_misses, nurul_misses, same_brains, longest_rally from public.our_misses_weeks()')).rows.map((w) => ({ ...w, week_start: w.week_start.toISOString().slice(0, 10) }))
  assert.deepEqual(weeks, [
    { week_start: '2026-11-23', aleem: 2 + 4 + 3 + 4, nurul: 1 + 3 + 3, aleem_misses: 3, nurul_misses: 2, same_brains: 1, longest_rally: 4 },
    { week_start: '2026-11-16', aleem: 3 + 3 + 1, nurul: 3, aleem_misses: 3, nurul_misses: 1, same_brains: 0, longest_rally: 3 },
  ])
  checks++

  // Both members read the same ledger.
  await as('authenticated', NURUL)
  assert.equal((await db.query('select * from public.our_misses_events')).rows.length, 11)
  assert.equal((await db.query('select * from public.our_misses_members')).rows.length, 2)
  checks += 2

  // ---- Phase 2: Prove It --------------------------------------------------------------
  const rpc = async (fn, ...args) => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r
  const eventsOf = async (kind) => (await db.query('select player, points, created_at from public.our_misses_events where kind = $1 order by id', [kind])).rows
  const DAY = 86_400_000
  const T2 = Date.parse('2026-11-23T04:00:00Z') // Monday 12:00 in Singapore

  await as('authenticated', ALEEM)
  await at(T2)
  const fresh = await rpc('our_misses_prove_today')
  assert.equal(fresh.day, '2026-11-23')
  assert.deepEqual(fresh.today, { day: '2026-11-23', revealed: false, Aleem: null, Nurul: null })
  assert.equal(fresh.last, null)
  assert.deepEqual(await rpc('our_misses_prove_start', 4), { level: 4, target: 18, started_at: new Date(T2).toISOString().replace('Z', '+00:00').replace('.000', '') })
  await fails('select public.our_misses_prove_start(2)', [], 'P0001')
  await fails('select public.our_misses_prove_start(8)', [], '22023')
  await at(T2 + 5_000)
  await fails('select public.our_misses_prove_finish(20)', [], '22023')
  await at(T2 + 25_000)
  await fails('select public.our_misses_prove_finish(81)', [], '22023')
  const mineDone = await rpc('our_misses_prove_finish', 20)
  assert.equal(mineDone.today.revealed, false)
  assert.deepEqual({ ...mineDone.today.Aleem, started_at: 0 }, { level: 4, target: 18, score: 20, passed: true, finished: true, started_at: 0 })
  assert.equal(mineDone.today.Nurul, null)
  assert.equal((await eventsOf('prove_it')).length, 0, 'Points wait for the reveal.')
  checks += 4

  await as('authenticated', NURUL)
  await at(T2 + 30_000)
  const peek = await rpc('our_misses_prove_today')
  assert.deepEqual(peek.today.Aleem, { finished: true }, "Aleem's claim stays hidden until Nurul plays.")
  await at(T2 + 60_000)
  await rpc('our_misses_prove_start', 7)
  await at(T2 + 85_000)
  const both = await rpc('our_misses_prove_finish', 30)
  assert.equal(both.today.revealed, true)
  assert.equal(both.today.Aleem.level, 4)
  assert.deepEqual([both.today.Nurul.passed, both.today.Nurul.target], [false, 37])
  const proven = await eventsOf('prove_it')
  assert.deepEqual(proven.map((e) => [e.player, e.points]), [['Aleem', 4]])
  assert.equal(proven[0].created_at.getTime(), T2 + 25_000, 'Points land when the game finished.')
  checks += 5

  // Walking away from a game is a bluff; the reveal waits until it times out.
  const T3 = T2 + DAY
  await as('authenticated', ALEEM)
  await at(T3)
  await rpc('our_misses_prove_start', 2)
  await as('authenticated', NURUL)
  await at(T3 + 5_000)
  await rpc('our_misses_prove_start', 1)
  await at(T3 + 30_000)
  assert.equal((await rpc('our_misses_prove_finish', 6)).today.revealed, false)
  await as('authenticated', ALEEM)
  await at(T3 + 180_000)
  await fails('select public.our_misses_prove_finish(9)', [], 'P0001')
  const timedOut = await rpc('our_misses_prove_today')
  assert.equal(timedOut.today.revealed, true)
  assert.deepEqual([timedOut.today.Aleem.score, timedOut.today.Aleem.passed], [0, false])
  assert.equal(timedOut.last.day, '2026-11-23')
  checks += 5

  // Only one of you played: revealed once the day is over.
  const T4 = T2 + 2 * DAY
  await as('authenticated', NURUL)
  await at(T4)
  await rpc('our_misses_prove_start', 3)
  await at(T4 + 21_000)
  assert.equal((await rpc('our_misses_prove_finish', 15)).today.revealed, false)
  await as('authenticated', ALEEM)
  await at(Date.parse('2026-11-25T16:01:00Z')) // Thursday 00:01 in Singapore
  const nextDay = await rpc('our_misses_prove_today')
  assert.equal(nextDay.today.Aleem, null)
  assert.deepEqual([nextDay.last.day, nextDay.last.revealed, nextDay.last.Nurul.level, nextDay.last.Nurul.passed], ['2026-11-25', true, 3, true])
  assert.deepEqual((await eventsOf('prove_it')).map((e) => [e.player, e.points]), [['Aleem', 4], ['Nurul', 1], ['Nurul', 3]])
  checks += 3

  // ---- Phase 2: Duel -------------------------------------------------------------------
  const T6 = T2 + 3 * DAY // Thursday 12:00
  await at(T6)
  const duel = await rpc('our_misses_duel_start')
  assert.equal(Date.parse(duel.starts_at), T6 + 4_000)
  await fails('select public.our_misses_duel_start()', [], 'P0001')
  await as('authenticated', NURUL)
  await at(T6 + 10_000)
  await fails('select public.our_misses_duel_finish($1, 40)', [duel.id], '22023')
  await fails('select public.our_misses_duel_finish($1, 301)', [duel.id], '22023')
  await at(T6 + 19_000)
  assert.equal((await rpc('our_misses_duel_finish', duel.id, 40)).settled, false)
  await as('authenticated', ALEEM)
  await at(T6 + 20_000)
  const won = await rpc('our_misses_duel_finish', duel.id, 55)
  assert.deepEqual([won.game, won.settled, won.winner, won.points, won.aleem_score, won.nurul_score], ['tug', true, 'Aleem', 5, 55, 40])
  checks += 4

  // Later duels that day are for glory only.
  await at(T6 + 60_000)
  const rematch = await rpc('our_misses_duel_start')
  await at(T6 + 80_000)
  await rpc('our_misses_duel_finish', rematch.id, 10)
  await as('authenticated', NURUL)
  const lost = await rpc('our_misses_duel_finish', rematch.id, 60)
  assert.deepEqual([lost.winner, lost.points], ['Nurul', 0])
  // A partner who never reports counts as 0 once the duel is 75 s old.
  await at(T6 + 120_000)
  const ghost = await rpc('our_misses_duel_start')
  await at(T6 + 140_000)
  await rpc('our_misses_duel_finish', ghost.id, 3)
  await at(T6 + 200_000)
  await rpc('our_misses_status')
  assert.deepEqual(await rpc('our_misses_duel_get', ghost.id).then((d) => [d.settled, d.winner, d.points, d.aleem_score]), [true, 'Nurul', 0, 0])
  assert.deepEqual((await eventsOf('duel')).map((e) => [e.player, e.points]), [['Aleem', 5]])
  checks += 3

  // ---- Pour-off: a water sort race, timed by the database ------------------------------
  const T7 = T6 + DAY // Friday 12:00
  await as('authenticated', ALEEM)
  await at(T7)
  await fails("select public.our_misses_duel_start('chess')", [], '22023')
  const race = await rpc('our_misses_duel_start', 'pour')
  assert.equal(race.game, 'pour')
  assert.ok(Number.isInteger(race.seed) && race.seed >= 0, 'Both phones build the puzzle from one seed.')
  await at(T7 + 2_000)
  await fails('select public.our_misses_duel_finish($1, 0, true)', [race.id], '22023') // before the start
  await at(T7 + 4_000 + 5_000)
  await fails('select public.our_misses_duel_finish($1, 0, true)', [race.id], '22023') // a 5 s solve is not believable
  await at(T7 + 4_000 + 48_000)
  const aleemSolved = await rpc('our_misses_duel_finish', race.id, 0, true)
  assert.deepEqual([aleemSolved.settled, aleemSolved.aleem_score], [false, 1_000_000 - 48_000])
  await as('authenticated', NURUL)
  await at(T7 + 4_000 + 61_500)
  const raced = await rpc('our_misses_duel_finish', race.id, 0, true)
  assert.deepEqual([raced.settled, raced.winner, raced.points, raced.nurul_score], [true, 'Aleem', 5, 1_000_000 - 61_500])
  checks += 5

  // Nobody solves: most bottles completed wins (and the phone can't claim more than 20).
  await at(T7 + 300_000)
  const slow = await rpc('our_misses_duel_start', 'pour')
  await at(T7 + 304_000 + 180_000)
  await rpc('our_misses_duel_finish', slow.id, 3, false)
  await as('authenticated', ALEEM)
  const giveUp = await rpc('our_misses_duel_finish', slow.id, 250, false)
  assert.deepEqual([giveUp.winner, giveUp.aleem_score, giveUp.nurul_score, giveUp.points], ['Aleem', 20, 3, 0])
  // An abandoned race closes a minute after its 3 minutes are up.
  await at(T7 + 600_000)
  const left = await rpc('our_misses_duel_start', 'pour')
  await at(T7 + 604_000 + 179_000)
  await rpc('our_misses_status')
  assert.equal((await rpc('our_misses_duel_get', left.id)).settled, false)
  await at(T7 + 604_000 + 241_000)
  await rpc('our_misses_status')
  assert.deepEqual(await rpc('our_misses_duel_get', left.id).then((d) => [d.settled, d.winner]), [true, 'tie'])
  assert.deepEqual((await eventsOf('duel')).map((e) => [e.player, e.points]), [['Aleem', 5], ['Aleem', 5]])
  checks += 4

  // The history board, now with Prove It and VS columns.
  const board = (await db.query('select * from public.our_misses_weeks()')).rows[0]
  assert.deepEqual({ ...board, week_start: board.week_start.toISOString().slice(0, 10) }, {
    week_start: '2026-11-23', aleem: 13 + 4 + 5 + 5, nurul: 7 + 1 + 3,
    aleem_misses: 3, nurul_misses: 2, same_brains: 1, longest_rally: 4,
    aleem_proven: 1, nurul_proven: 2, aleem_bluffs: 1, nurul_bluffs: 1, aleem_duels: 2, nurul_duels: 0,
  })
  checks++

  // Claims and duels are only reachable through the functions.
  await fails('select * from our_misses_private.prove')
  await fails('select * from our_misses_private.duels')
  await as('anon')
  for (const sql of ['select public.our_misses_prove_today()', 'select public.our_misses_prove_start(1)', 'select public.our_misses_prove_finish(1)', 'select public.our_misses_duel_start()', 'select public.our_misses_duel_finish(1, 1, false)', 'select public.our_misses_duel_get(1)']) await fails(sql)
  await as('authenticated', OUTSIDER)
  await fails('select public.our_misses_prove_today()')
  await fails('select public.our_misses_duel_start()')

  console.log(`SQL checks passed: ${checks}`)
} finally {
  await db.close()
}
