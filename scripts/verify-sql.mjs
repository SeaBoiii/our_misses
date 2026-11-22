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
  const weeks = (await db.query('select * from public.our_misses_weeks()')).rows.map((w) => ({ ...w, week_start: w.week_start.toISOString().slice(0, 10) }))
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

  console.log(`SQL checks passed: ${checks}`)
} finally {
  await db.close()
}
