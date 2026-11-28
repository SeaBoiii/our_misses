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

  // ---- The daily lineup: only today's games can be started ---------------------------
  const lineup = (await db.query('select public.our_misses_lineup() as r')).rows[0].r
  assert.deepEqual(lineup.today, { day: '2026-11-22', daily: 'hth', play: ['sps', 'quiz', 'chope', 'cannot'] })
  assert.deepEqual(lineup.tomorrow, { day: '2026-11-23', daily: 'agak', play: ['tug', 'kopi', 'mrt', 'sync'] })
  await fails('select public.our_misses_prove_start(3)', [], 'P0001') // a Heart to Heart day
  await fails(`select public.our_misses_doodle_submit('doodle-01', '[{"c":0,"w":2,"p":[1,2]}]')`, [], 'P0001')
  await fails("select public.our_misses_duel_start('mrt')", [], 'P0001') // not in today's four
  assert.equal((await db.query('select public.our_misses_agak_today() as r')).rows[0].r.today, null, 'No round is dealt on other days.')
  await at(T0 + 15 * 60_000) // Monday 00:05: an Agak Agak day now
  await fails("select public.our_misses_tot_answer('tot-1', 0, 0)", [], 'P0001')
  await fails("select public.our_misses_duel_start('golf')", [], 'P0001')
  // 40 days: one daily game, three versus games and one together game each day; never
  // yesterday's daily or together game, and at most one of yesterday's versus games.
  await as(null)
  const N = 40
  const TOGETHER = ['chapteh', 'cannot', 'draw', 'sync']
  const cycle = (await db.query(`select our_misses_private.lineup(date '2026-11-22' + n) as l from generate_series(0, ${N}) n`)).rows.map((r) => r.l)
  const seen = {}
  for (let i = 0; i < N; i++) {
    const [today, before] = [cycle[i], cycle[(i + N - 1) % N]]
    assert.ok(today.play.slice(0, 3).filter((g) => before.play.includes(g)).length <= 1)
    assert.notEqual(today.daily, before.daily)
    assert.notEqual(today.play[3], before.play[3])
    assert.equal(new Set(today.play).size, 4)
    assert.ok(TOGETHER.includes(today.play[3]) && today.play.slice(0, 3).every((g) => !TOGETHER.includes(g)))
    for (const g of [today.daily, ...today.play]) seen[g] = (seen[g] ?? 0) + 1
  }
  assert.deepEqual(seen, {
    prove: 8, tot: 8, hth: 8, agak: 8, doodle: 8,
    tug: 15, pour: 15, quiz: 15, mrt: 15, kopi: 15, sps: 15, golf: 15, chope: 15,
    chapteh: 10, cannot: 10, draw: 10, sync: 10,
  })
  assert.deepEqual({ ...cycle[N], day: 0 }, { ...cycle[0], day: 0 }, 'The cycle repeats every 40 days.')
  await as('anon')
  await fails('select public.our_misses_lineup()')
  await as('authenticated', ALEEM)
  await fails('select our_misses_private.lineup(current_date)') // only through the public function
  await at(T0)
  checks += 8
  // The rest of this suite plays every game on whatever day suits it.
  await as(null)
  await db.exec("create or replace function our_misses_private.on_today(p_game text, t timestamptz) returns boolean language sql stable set search_path = '' as $$ select true $$")
  await as('authenticated', ALEEM)

  // A rally across midnight on Sunday.
  const a1 = await send(3)
  assert.equal(a1.events.length, 1)
  assert.deepEqual({ ...a1.events[0], id: 0, created_at: 0 }, { id: 0, created_at: 0, player: 'Aleem', kind: 'miss', charge: 3, rally_length: 1, rally_bonus: 0, points: 3, ref_id: null, reason: null })
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
    hands: 0, tot: 0, best_chapteh: 0, hth: 0, agak: 0, cannot: 0, doodle: 0, draw: 0, sync: 0, best_golf: 0,
  })
  checks++

  // ---- Phase 3: Why ----------------------------------------------------------------------
  const T8 = T7 + DAY // Saturday 12:00, same season
  await as('authenticated', ALEEM)
  await at(T8)
  const why = (await send(2)).events[0]
  assert.equal((await rpc('our_misses_tag', why.id, 1)).reason, 1)
  await fails('select public.our_misses_tag($1, 2)', [why.id], 'P0001') // tagged once
  await fails('select public.our_misses_tag($1, 11)', [why.id], '22023')
  const sameBrainRow = (await db.query("select id from public.our_misses_events where kind = 'same_brain' limit 1")).rows[0]
  await fails('select public.our_misses_tag($1, 3)', [sameBrainRow.id], 'P0001') // only misses
  await as('authenticated', NURUL)
  await fails('select public.our_misses_tag($1, 3)', [why.id], 'P0001') // only your own
  await as('authenticated', ALEEM)
  await at(T8 + 30_000)
  const late = (await send(1)).events[0]
  await at(T8 + 30_000 + 11 * 60_000)
  await fails('select public.our_misses_tag($1, 3)', [late.id], 'P0001') // within 10 minutes
  assert.deepEqual((await db.query('select * from public.our_misses_reasons()')).rows, [{ player: 'Aleem', reason: 1, n: 1 }])
  checks += 7

  // ---- Phase 3: Hold hands ----------------------------------------------------------------
  assert.deepEqual(await rpc('our_misses_hands', 45), { earned: 2, today: 2, cap: 5 })
  assert.equal((await rpc('our_misses_hands', 19)).earned, 0)
  assert.deepEqual(await rpc('our_misses_hands', 100), { earned: 3, today: 5, cap: 5 }, '5 a day at most')
  assert.equal((await rpc('our_misses_hands', 100)).earned, 0)
  await fails('select public.our_misses_hands(-1)', [], '22023')
  await as('authenticated', NURUL)
  assert.equal((await rpc('our_misses_hands', 60)).earned, 3)
  checks += 6

  // ---- Phase 3: This or That --------------------------------------------------------------
  await as('authenticated', ALEEM)
  assert.deepEqual((await rpc('our_misses_tot_today')).today, { day: '2026-11-28', revealed: false, Aleem: null, Nurul: null })
  const aleemPick = await rpc('our_misses_tot_answer', 'tot-3', 1, 0)
  assert.deepEqual([aleemPick.today.Aleem, aleemPick.today.Nurul], [{ question: 'tot-3', mine: 1, guess: 0 }, null])
  await fails("select public.our_misses_tot_answer('tot-3', 0, 0)", [], 'P0001')
  await fails("select public.our_misses_tot_answer('tot-3', 2, 0)", [], '22023')
  await as('authenticated', NURUL)
  assert.deepEqual((await rpc('our_misses_tot_today')).today.Aleem, { answered: true }, 'Hidden until you both answer.')
  const totBoth = await rpc('our_misses_tot_answer', 'tot-3', 0, 1)
  assert.equal(totBoth.today.revealed, true)
  assert.deepEqual(totBoth.today.Aleem, { question: 'tot-3', mine: 1, guess: 0 })
  assert.deepEqual((await eventsOf('tot')).map((e) => [e.player, e.points]), [['Aleem', 2], ['Nurul', 2]])
  const album = await rpc('our_misses_tot_album', 10)
  assert.deepEqual([album.length, album[0].day, album[0].Nurul.mine], [1, '2026-11-28', 0])
  checks += 8

  // ---- Phase 3: Kiasu Quiz (versus) -------------------------------------------------------
  await as('authenticated', ALEEM)
  await at(T8 + 60 * 60_000)
  const quiz = await rpc('our_misses_duel_start', 'quiz')
  assert.equal(quiz.game, 'quiz')
  await at(T8 + 60 * 60_000 + 9_000)
  await fails('select public.our_misses_duel_finish($1, 500, false)', [quiz.id], '22023') // 5 s into the quiz
  await at(T8 + 60 * 60_000 + 70_000)
  await fails('select public.our_misses_duel_finish($1, 2001, false)', [quiz.id], '22023')
  assert.equal((await rpc('our_misses_duel_finish', quiz.id, 1600, false)).aleem_score, 1540, 'capped at a perfect quiz')
  await as('authenticated', NURUL)
  const quizDone = await rpc('our_misses_duel_finish', quiz.id, 1300, false)
  assert.deepEqual([quizDone.winner, quizDone.points], ['Aleem', 5])
  // Next Stop (the MRT quiz) plays by the same rules; today's +5 is already taken.
  await at(T8 + 65 * 60_000)
  const mrt = await rpc('our_misses_duel_start', 'mrt')
  await at(T8 + 65 * 60_000 + 60_000)
  await rpc('our_misses_duel_finish', mrt.id, 1700, false)
  await as('authenticated', ALEEM)
  const mrtDone = await rpc('our_misses_duel_finish', mrt.id, 900, false)
  assert.deepEqual([mrtDone.game, mrtDone.nurul_score, mrtDone.winner, mrtDone.points], ['mrt', 1540, 'Nurul', 0])
  checks += 6

  // ---- Phase 3: Chapteh (together) --------------------------------------------------------
  const kick = async (aleemSays, nurulSays, offsetMin) => {
    await as('authenticated', ALEEM)
    await at(T8 + offsetMin * 60_000)
    const c = await rpc('our_misses_duel_start', 'chapteh')
    await at(T8 + offsetMin * 60_000 + 40_000)
    await rpc('our_misses_duel_finish', c.id, aleemSays, false)
    await as('authenticated', NURUL)
    return rpc('our_misses_duel_finish', c.id, nurulSays, false)
  }
  const firstRally = await kick(23, 21, 70)
  assert.deepEqual([firstRally.winner, firstRally.points], ['tie', 0], 'Together: nobody wins.')
  await kick(30, 30, 80)
  await kick(40, 40, 90)
  await kick(0, 0, 100)
  // 21 agreed kicks = 5 each; 30 = 6 (a rally's max); 40 = 1 more before the 12-a-day cap.
  assert.deepEqual((await eventsOf('rally')).map((e) => [e.player, e.points]), [['Aleem', 5], ['Nurul', 5], ['Aleem', 6], ['Nurul', 6], ['Aleem', 1], ['Nurul', 1]])
  checks += 2

  const board3 = (await db.query('select * from public.our_misses_weeks()')).rows[0]
  assert.deepEqual({ ...board3, week_start: board3.week_start.toISOString().slice(0, 10) }, {
    week_start: '2026-11-23',
    aleem: 27 + 2 + 1 + 5 + 2 + 5 + 12, nurul: 11 + 3 + 2 + 12,
    aleem_misses: 5, nurul_misses: 2, same_brains: 1, longest_rally: 4,
    aleem_proven: 1, nurul_proven: 2, aleem_bluffs: 1, nurul_bluffs: 1, aleem_duels: 3, nurul_duels: 0,
    hands: 8, tot: 4, best_chapteh: 40, hth: 0, agak: 0, cannot: 0, doodle: 0, draw: 0, sync: 0, best_golf: 0,
  })
  checks++

  // ---- Batch 1: Heart to Heart -------------------------------------------------------------
  await as('authenticated', ALEEM)
  await at(T8 + 2 * 60 * 60_000)
  assert.deepEqual((await rpc('our_misses_hth_today')).today, { day: '2026-11-28', revealed: false, Aleem: null, Nurul: null })
  const hthMine = await rpc('our_misses_hth_answer', 'know-03', '  Your laugh on the phone.  ')
  assert.deepEqual([hthMine.today.Aleem, hthMine.today.Nurul], [{ question: 'know-03', answer: 'Your laugh on the phone.' }, null])
  await fails("select public.our_misses_hth_answer('know-03', 'again')", [], 'P0001')
  await as('authenticated', NURUL)
  await fails("select public.our_misses_hth_answer('know-03', '   ')", [], '22023')
  await fails('select public.our_misses_hth_answer($1, $2)', ['know-03', 'x'.repeat(601)], '22023')
  assert.deepEqual((await rpc('our_misses_hth_today')).today.Aleem, { answered: true }, 'Hidden until you both answer.')
  assert.equal((await eventsOf('hth')).length, 0)
  const hthBoth = await rpc('our_misses_hth_answer', 'know-03', 'Your voice notes.')
  assert.equal(hthBoth.today.revealed, true)
  assert.equal(hthBoth.today.Aleem.answer, 'Your laugh on the phone.')
  assert.deepEqual((await eventsOf('hth')).map((e) => [e.player, e.points]), [['Aleem', 2], ['Nurul', 2]])
  const hthAlbum = await rpc('our_misses_hth_album', 10)
  assert.deepEqual([hthAlbum.length, hthAlbum[0].day, hthAlbum[0].Nurul.answer], [1, '2026-11-28', 'Your voice notes.'])
  checks += 10

  // ---- Batch 1: Agak Agak --------------------------------------------------------------------
  await as('authenticated', NURUL)
  const agakPeek = (await rpc('our_misses_agak_today')).today
  assert.deepEqual([agakPeek.psychic, agakPeek.target, agakPeek.clue], ['Aleem', null, null], 'Aleem clues first; the target stays hidden.')
  assert.match(agakPeek.card, /^agak-([1-9]|[1-9]\d)$/)
  await fails("select public.our_misses_agak_clue('hot')", [], 'P0001') // not the Psychic
  await fails('select public.our_misses_agak_guess(90)', [], 'P0001') // no clue yet
  await as('authenticated', ALEEM)
  const agakMine = (await rpc('our_misses_agak_today')).today
  assert.ok(agakMine.target >= 16.25 && agakMine.target <= 163.75, 'The Psychic sees the target.')
  await fails('select public.our_misses_agak_clue($1)', ['x'.repeat(81)], '22023')
  assert.equal((await rpc('our_misses_agak_clue', ' lukewarm milo ')).today.clue, 'lukewarm milo')
  await fails("select public.our_misses_agak_clue('another')", [], 'P0001') // one clue
  await fails('select public.our_misses_agak_guess(90)', [], 'P0001') // the Psychic doesn't guess
  await as('authenticated', NURUL)
  await fails('select public.our_misses_agak_guess(181)', [], '22023')
  const bullseye = (await rpc('our_misses_agak_guess', Number(agakMine.target) - 2)).today
  assert.deepEqual([bullseye.score, Number(bullseye.target)], [4, Number(agakMine.target)])
  await fails('select public.our_misses_agak_guess(90)', [], 'P0001') // one guess
  assert.deepEqual((await eventsOf('agak')).map((e) => [e.player, e.points]), [['Aleem', 4], ['Nurul', 4]], 'You score together.')
  // The next Agak day, the guesser clues. A miss by 20 degrees scores nothing.
  const T9 = T8 + DAY // Sunday 12:00, the season's last day
  await at(T9)
  const agak2 = (await rpc('our_misses_agak_today'))
  assert.deepEqual([agak2.today.psychic, agak2.last.day, agak2.last.score], ['Nurul', '2026-11-28', 4])
  await rpc('our_misses_agak_clue', 'your driving')
  await as('authenticated', ALEEM)
  const far = Number(agak2.today.target) > 90 ? Number(agak2.today.target) - 20 : Number(agak2.today.target) + 20
  assert.equal((await rpc('our_misses_agak_guess', far)).today.score, 0)
  assert.equal((await eventsOf('agak')).length, 2)
  checks += 16

  // ---- Batch 1: Kopi Rush (versus) -----------------------------------------------------------
  const kopi = await rpc('our_misses_duel_start', 'kopi')
  await at(T9 + 4_000 + 30_000)
  await fails('select public.our_misses_duel_finish($1, 9, false)', [kopi.id], '22023') // mid-shift
  await at(T9 + 4_000 + 57_000)
  assert.equal((await rpc('our_misses_duel_finish', kopi.id, 55, false)).aleem_score, 40, 'capped')
  await as('authenticated', NURUL)
  const kopiDone = await rpc('our_misses_duel_finish', kopi.id, 12, false)
  assert.deepEqual([kopiDone.game, kopiDone.winner, kopiDone.points], ['kopi', 'Aleem', 5], "Sunday's first win.")
  checks += 3

  // ---- Batch 1: Scissors-Paper-Stone (versus) ------------------------------------------------
  await at(T9 + 5 * 60_000)
  const sps = await rpc('our_misses_duel_start', 'sps')
  const throwAs = async (who, round, hand) => { await as('authenticated', who); return rpc('our_misses_sps_throw', sps.id, round, hand) }
  await fails("select public.our_misses_sps_throw($1, 1, 'stone')", [sps.id], 'P0001') // before the start
  await at(T9 + 5 * 60_000 + 6_000)
  await fails("select public.our_misses_sps_throw($1, 1, 'rock')", [sps.id], '22023')
  const a1t = await throwAs(ALEEM, 1, 'stone')
  assert.deepEqual([a1t.waiting, a1t.rounds, a1t.next], [true, [], 2])
  await fails("select public.our_misses_sps_throw($1, 2, 'paper')", [sps.id], 'P0001') // one round ahead at most
  await as('authenticated', NURUL)
  assert.deepEqual((await rpc('our_misses_sps_get', sps.id)).rounds, [], "Aleem's throw stays hidden.")
  const n1t = await throwAs(NURUL, 1, 'paper')
  assert.deepEqual(n1t.rounds, [{ round: 1, mine: 'paper', theirs: 'stone', winner: 'me' }])
  await fails('select public.our_misses_duel_finish($1, 3, false)', [sps.id], '22023') // the match isn't over
  // tie, Nurul, Aleem, Nurul: 3-1 to Nurul after five throws.
  for (const [round, a, n] of [[2, 'scissors', 'scissors'], [3, 'scissors', 'stone'], [4, 'stone', 'scissors'], [5, 'paper', 'scissors']]) {
    await throwAs(ALEEM, round, a)
    await throwAs(NURUL, round, n)
  }
  const spsState = await rpc('our_misses_sps_get', sps.id)
  assert.deepEqual([spsState.mine, spsState.theirs, spsState.over, spsState.rounds.length], [3, 1, true, 5])
  await fails("select public.our_misses_sps_throw($1, 6, 'paper')", [sps.id], 'P0001') // over
  await rpc('our_misses_duel_finish', sps.id, 999, false)
  await as('authenticated', ALEEM)
  const spsDone = await rpc('our_misses_duel_finish', sps.id, 999, false)
  assert.deepEqual([spsDone.winner, spsDone.aleem_score, spsDone.nurul_score, spsDone.points], ['Nurul', 1, 3, 0], 'Scored from the throws, not the phones.')
  checks += 9

  // ---- Batch 1: Cannot Say! (together) -------------------------------------------------------
  const say = async (aleemSays, nurulSays, offsetMin) => {
    await as('authenticated', ALEEM)
    await at(T9 + offsetMin * 60_000)
    const c = await rpc('our_misses_duel_start', 'cannot')
    await at(T9 + offsetMin * 60_000 + 4_000 + 87_000)
    await rpc('our_misses_duel_finish', c.id, aleemSays, false)
    await as('authenticated', NURUL)
    return rpc('our_misses_duel_finish', c.id, nurulSays, false)
  }
  await as('authenticated', ALEEM)
  await at(T9 + 10 * 60_000)
  const early = await rpc('our_misses_duel_start', 'cannot')
  await at(T9 + 10 * 60_000 + 60_000)
  await fails('select public.our_misses_duel_finish($1, 5, false)', [early.id], '22023') // mid-round
  await at(T9 + 15 * 60_000) // the abandoned round closes after 2.5 minutes
  const firstSay = await say(9, 7, 15)
  assert.deepEqual([firstSay.game, firstSay.winner, firstSay.points, firstSay.aleem_score], ['cannot', 'tie', 0, 9])
  await say(4, 4, 20)
  await say(61, 5, 25)
  // 7 agreed words = 6 (a round's max); then 4; then 2 more before the 12-a-day cap.
  assert.deepEqual((await eventsOf('cannot')).map((e) => [e.player, e.points]), [['Aleem', 6], ['Nurul', 6], ['Aleem', 4], ['Nurul', 4], ['Aleem', 2], ['Nurul', 2]])
  checks += 3

  const board4 = (await db.query('select * from public.our_misses_weeks()')).rows[0]
  assert.deepEqual(
    [board4.aleem, board4.nurul, board4.aleem_duels, board4.nurul_duels, board4.hth, board4.agak, board4.cannot],
    [54 + 2 + 4 + 5 + 12, 28 + 2 + 4 + 12, 4, 0, 4, 8, 24],
  )
  checks++

  // ---- Batch 2: Doodle Day ------------------------------------------------------------------
  const T10 = T9 + 60 * 60_000 // Sunday 13:00
  const scribble = JSON.stringify([{ c: 0, w: 2, p: [100, 120, 180, 220, 260, 240] }, { c: 1, w: 1, p: [500, 500, 520, 530] }])
  await as('authenticated', ALEEM)
  await at(T10)
  assert.deepEqual((await rpc('our_misses_doodle_today')).today, { day: '2026-11-29', revealed: false, Aleem: null, Nurul: null })
  const myDoodle = await rpc('our_misses_doodle_submit', 'doodle-03', scribble)
  assert.deepEqual([myDoodle.today.Aleem.prompt, myDoodle.today.Aleem.strokes.length, myDoodle.today.Nurul], ['doodle-03', 2, null])
  await fails('select public.our_misses_doodle_submit($1, $2)', ['doodle-03', scribble], 'P0001') // once a day
  await as('authenticated', NURUL)
  await fails('select public.our_misses_doodle_submit($1, $2)', ['doodle-03', '{}'], '22023')
  await fails('select public.our_misses_doodle_submit($1, $2)', ['doodle-03', '[]'], '22023')
  await fails('select public.our_misses_doodle_submit($1, $2)', ['doodle-03', JSON.stringify([{ c: 0, w: 1, p: Array(30_000).fill(500) }])], '22023') // too big
  assert.deepEqual((await rpc('our_misses_doodle_today')).today.Aleem, { drawn: true }, 'Hidden until you both draw.')
  const bothDoodles = await rpc('our_misses_doodle_submit', 'doodle-03', scribble)
  assert.equal(bothDoodles.today.revealed, true)
  assert.equal(bothDoodles.today.Aleem.strokes[0].p.length, 6)
  assert.deepEqual((await eventsOf('doodle')).map((e) => [e.player, e.points]), [['Aleem', 2], ['Nurul', 2]])
  assert.deepEqual((await rpc('our_misses_doodle_album', 5)).map((d) => d.day), ['2026-11-29'])
  checks += 10

  // ---- Batch 2: Marina Mini Golf (versus) ---------------------------------------------------
  await as('authenticated', ALEEM)
  await at(T10 + 5 * 60_000)
  const golf = await rpc('our_misses_duel_start', 'golf')
  await at(T10 + 5 * 60_000 + 4_000 + 3_000)
  await fails('select public.our_misses_duel_finish($1, 30, false)', [golf.id], '22023') // 3 seconds in
  await at(T10 + 5 * 60_000 + 4_000 + 60_000)
  await rpc('our_misses_duel_finish', golf.id, 31, false) // 9 strokes
  await as('authenticated', NURUL)
  const golfDone = await rpc('our_misses_duel_finish', golf.id, 50, false)
  assert.deepEqual([golfDone.game, golfDone.nurul_score, golfDone.winner, golfDone.points], ['golf', 37, 'Nurul', 0], 'Capped at 3 holes in one; Sunday’s +5 is gone.')
  checks += 2

  // ---- Batch 2: Chope Wars (versus, turn by turn) -------------------------------------------
  await as('authenticated', ALEEM)
  await at(T10 + 10 * 60_000)
  const chope = await rpc('our_misses_duel_start', 'chope') // Aleem accepted, so Nurul moves first
  const moveAs = async (who, n, kind, stool) => { await as('authenticated', who); return rpc('our_misses_chope_move', chope.id, n, kind, stool) }
  await as('authenticated', NURUL)
  await fails("select public.our_misses_chope_move($1, 1, 'place', 0)", [chope.id], 'P0001') // before the start
  await at(T10 + 10 * 60_000 + 5_000)
  await as('authenticated', ALEEM)
  await fails("select public.our_misses_chope_move($1, 1, 'place', 0)", [chope.id], 'P0001') // not Aleem's turn
  assert.equal((await moveAs(NURUL, 1, 'place', 0)).length, 1)
  await fails("select public.our_misses_chope_move($1, 2, 'place', 3)", [chope.id], 'P0001') // Nurul again
  await as('authenticated', ALEEM)
  await fails("select public.our_misses_chope_move($1, 2, 'place', 0)", [chope.id], 'P0001') // already choped
  await fails("select public.our_misses_chope_move($1, 2, 'place', 24)", [chope.id], '22023')
  await fails("select public.our_misses_chope_move($1, 2, 'swap', 5)", [chope.id], 'P0001') // nothing to swap there
  await moveAs(ALEEM, 2, 'place', 1)
  await moveAs(NURUL, 3, 'swap', 1) // the cleaner auntie
  await moveAs(ALEEM, 4, 'swap', 0)
  await as('authenticated', NURUL)
  await fails("select public.our_misses_chope_move($1, 5, 'swap', 0)", [chope.id], 'P0001') // one auntie a game
  await fails('select public.our_misses_duel_finish($1, 80, false)', [chope.id], '22023') // stools left
  for (let stool = 2, n = 5; stool < 24; stool++, n++) await moveAs(n % 2 ? NURUL : ALEEM, n, 'place', stool)
  await as('authenticated', ALEEM)
  await fails("select public.our_misses_chope_move($1, 27, 'place', 2)", [chope.id], 'P0001')
  const moves = await rpc('our_misses_chope_get', chope.id)
  assert.deepEqual([moves.length, moves[2], moves[25].stool], [26, { n: 3, player: 'Nurul', kind: 'swap', stool: 1 }, 23])
  await rpc('our_misses_duel_finish', chope.id, 70, false)
  await as('authenticated', NURUL)
  const chopeDone = await rpc('our_misses_duel_finish', chope.id, 55, false)
  assert.deepEqual([chopeDone.winner, chopeDone.aleem_score], ['Aleem', 70])
  checks += 11

  // ---- Batch 2: Draw & Guess and In Sync (together) -----------------------------------------
  const together = async (game, aleemSays, nurulSays, offsetMin, lasts) => {
    await as('authenticated', ALEEM)
    await at(T10 + offsetMin * 60_000)
    const g = await rpc('our_misses_duel_start', game)
    await at(T10 + offsetMin * 60_000 + 4_000 + lasts)
    await rpc('our_misses_duel_finish', g.id, aleemSays, false)
    await as('authenticated', NURUL)
    return rpc('our_misses_duel_finish', g.id, nurulSays, false)
  }
  await as('authenticated', ALEEM)
  await at(T10 + 20 * 60_000)
  const earlySync = await rpc('our_misses_duel_start', 'sync')
  await at(T10 + 20 * 60_000 + 4_000 + 10_000)
  await fails('select public.our_misses_duel_finish($1, 9, false)', [earlySync.id], '22023') // the song is still on
  const drawn = await together('draw', 8, 5, 25, 87_000)
  assert.deepEqual([drawn.game, drawn.winner], ['draw', 'tie'])
  await together('sync', 10, 9, 30, 26_000)
  await together('sync', 24, 30, 35, 26_000)
  // Draw & Guess: 5 agreed words = 5 each. In Sync: 9 agreed beats = 2, then 24 = 6 (a round's max).
  assert.deepEqual((await eventsOf('draw')).map((e) => [e.player, e.points]), [['Aleem', 5], ['Nurul', 5]])
  assert.deepEqual((await eventsOf('sync')).map((e) => [e.player, e.points]), [['Aleem', 2], ['Nurul', 2], ['Aleem', 6], ['Nurul', 6]])
  checks += 4

  const board5 = (await db.query('select * from public.our_misses_weeks()')).rows[0]
  assert.deepEqual([board5.doodle, board5.draw, board5.sync, board5.best_golf], [4, 10, 16, 3])
  checks++

  // Claims and duels are only reachable through the functions.
  await fails('select * from our_misses_private.prove')
  await fails('select * from our_misses_private.duels')
  await as('anon')
  for (const sql of ['select public.our_misses_prove_today()', 'select public.our_misses_prove_start(1)', 'select public.our_misses_prove_finish(1)', 'select public.our_misses_duel_start()', 'select public.our_misses_duel_finish(1, 1, false)', 'select public.our_misses_duel_get(1)']) await fails(sql)
  await as('authenticated', OUTSIDER)
  await fails('select public.our_misses_prove_today()')
  await fails('select public.our_misses_duel_start()')
  for (const sql of ['select public.our_misses_tag(1, 1)', 'select * from public.our_misses_reasons()', 'select public.our_misses_hands(60)', 'select public.our_misses_tot_today()', "select public.our_misses_tot_answer('tot-1', 0, 0)", 'select public.our_misses_tot_album(5)']) await fails(sql)
  await as('anon')
  for (const sql of ['select public.our_misses_tag(1, 1)', 'select public.our_misses_hands(60)', 'select public.our_misses_tot_today()', 'select public.our_misses_tot_album(5)']) await fails(sql)
  await fails('select * from our_misses_private.tot')
  for (const table of ['hth', 'agak', 'sps']) await fails(`select * from our_misses_private.${table}`)
  const batch1 = ['select public.our_misses_hth_today()', "select public.our_misses_hth_answer('know-01', 'hi')", 'select public.our_misses_hth_album(5)', 'select public.our_misses_agak_today()', "select public.our_misses_agak_clue('hi')", 'select public.our_misses_agak_guess(90)', "select public.our_misses_sps_throw(1, 1, 'stone')", 'select public.our_misses_sps_get(1)']
  for (const sql of batch1) await fails(sql)
  await as('authenticated', OUTSIDER)
  for (const sql of batch1) await fails(sql)
  await as('anon')
  for (const table of ['doodle', 'chope']) await fails(`select * from our_misses_private.${table}`)
  const batch2 = ['select public.our_misses_doodle_today()', `select public.our_misses_doodle_submit('doodle-01', '[{"c":0}]')`, 'select public.our_misses_doodle_album(5)', "select public.our_misses_chope_move(1, 1, 'place', 0)", 'select public.our_misses_chope_get(1)']
  for (const sql of batch2) await fails(sql)
  await as('authenticated', OUTSIDER)
  for (const sql of batch2) await fails(sql)
  await as('authenticated', ALEEM)
  for (const table of ['doodle', 'chope']) await fails(`select * from our_misses_private.${table}`)

  console.log(`SQL checks passed: ${checks}`)
} finally {
  await db.close()
}
