-- Phase 2: Prove It (claim how much you missed them today, then prove it in a catch game)
-- and VS games (live head-to-head: a 15-second tap battle, or a water sort race). Both feed points into the same ledger.
-- Claims and duels live in the private schema and are only reachable through the functions
-- below, so today's claim stays secret until both of you have played.
begin;

-- New kinds of points in the ledger -------------------------------------------------------
alter table public.our_misses_events drop constraint our_misses_events_kind_check;
alter table public.our_misses_events add constraint our_misses_events_kind_check
  check (kind in ('miss', 'same_brain', 'prove_it', 'duel'));
alter table public.our_misses_events drop constraint our_misses_event_shape;
alter table public.our_misses_events add constraint our_misses_event_shape check (
  (kind = 'miss' and charge is not null and rally_length is not null and ref_id is null
    and points = charge + rally_bonus)
  or (kind = 'same_brain' and charge is null and rally_length is null and ref_id is not null
    and rally_bonus = 0 and points = 3)
  or (kind = 'prove_it' and charge is null and rally_length is null and ref_id is null
    and rally_bonus = 0 and points between 1 and 7)
  or (kind = 'duel' and charge is null and rally_length is null and ref_id is null
    and rally_bonus = 0 and points = 5)
);

-- Days run midnight to midnight in Singapore.
create function our_misses_private.day_of(t timestamptz)
returns date language sql immutable set search_path = ''
as $$ select (t at time zone 'Asia/Singapore')::date; $$;

-- Catch-game score needed to prove each level (1 = a kaya toast crumb … 7 = every star).
create function our_misses_private.prove_target(level int)
returns int language sql immutable set search_path = ''
as $$ select (array[6, 10, 14, 18, 24, 30, 37])[level]; $$;

-- Prove It --------------------------------------------------------------------------------
create table our_misses_private.prove (
  player text not null check (player in ('Aleem', 'Nurul')),
  day date not null,
  level smallint not null check (level between 1 and 7),
  started_at timestamptz not null,
  finished_at timestamptz,
  score smallint check (score between 0 and 80),
  passed boolean,
  settled_at timestamptz,
  primary key (player, day)
);
alter table our_misses_private.prove enable row level security;
revoke all on our_misses_private.prove from public, anon, authenticated;

-- VS games ----------------------------------------------------------------------------------
-- tug:  15 seconds of tapping; the score is the taps.
-- pour: a water sort race on one shared puzzle (built on both phones from the same seed).
--       Solving scores 1,000,000 minus the milliseconds it took, timed here rather than on
--       the phone; otherwise the score is the bottles completed. Higher wins either way.
create table our_misses_private.duels (
  id bigint generated always as identity primary key,
  game text not null default 'tug' check (game in ('tug', 'pour')),
  seed int not null default 0,
  started_by text not null check (started_by in ('Aleem', 'Nurul')),
  starts_at timestamptz not null,
  aleem_score int check (aleem_score between 0 and 1000000),
  nurul_score int check (nurul_score between 0 and 1000000),
  winner text check (winner in ('Aleem', 'Nurul', 'tie')),
  points smallint not null default 0 check (points in (0, 5)),
  settled_at timestamptz
);
create unique index our_misses_one_open_duel on our_misses_private.duels ((settled_at is null)) where settled_at is null;
alter table our_misses_private.duels enable row level security;
revoke all on our_misses_private.duels from public, anon, authenticated;

create function our_misses_private.vs_length(game text)
returns interval language sql immutable set search_path = ''
as $$ select case game when 'pour' then interval '180 seconds' else interval '15 seconds' end; $$;

create function our_misses_private.duel_json(d our_misses_private.duels)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id, 'game', d.game, 'seed', d.seed, 'started_by', d.started_by, 'starts_at', d.starts_at,
    'aleem_score', d.aleem_score, 'nurul_score', d.nurul_score,
    'winner', d.winner, 'points', d.points, 'settled', d.settled_at is not null,
    'now', our_misses_private.clock());
$$;

-- Close a VS game: a missing score counts as 0; the first decisive win of the day is worth +5.
create function our_misses_private.settle_duel(p_id bigint, t timestamptz)
returns void language plpgsql set search_path = ''
as $$
declare
  d our_misses_private.duels%rowtype;
  a int;
  n int;
  w text;
  paid boolean;
begin
  select * into d from our_misses_private.duels where id = p_id and settled_at is null for update;
  if not found then return; end if;
  a := coalesce(d.aleem_score, 0);
  n := coalesce(d.nurul_score, 0);
  w := case when a = n then 'tie' when a > n then 'Aleem' else 'Nurul' end;
  select exists (
    select 1 from our_misses_private.duels x
    where x.points > 0 and our_misses_private.day_of(x.starts_at) = our_misses_private.day_of(d.starts_at)
  ) into paid;
  update our_misses_private.duels set
    aleem_score = a, nurul_score = n, winner = w,
    points = case when w <> 'tie' and not paid then 5 else 0 end,
    settled_at = t
  where id = p_id;
  if w <> 'tie' and not paid then
    insert into public.our_misses_events (player, kind, points, created_at) values (w, 'duel', 5, t);
  end if;
end;
$$;

-- Anything that has run its course gets settled whenever either of you opens the app.
create function our_misses_private.settle(t timestamptz)
returns void language plpgsql set search_path = ''
as $$
declare
  today date := our_misses_private.day_of(t);
  d record;
begin
  perform pg_advisory_xact_lock(hashtext('our_misses_settle'));

  -- A Prove It game not finished within 2 minutes is a bluff with 0.
  update our_misses_private.prove
  set score = 0, passed = false, finished_at = started_at + interval '2 minutes'
  where finished_at is null and started_at < t - interval '2 minutes';

  -- Reveal a day once both have played, or once the day is over. Points land at the moment
  -- each game finished, so they count in the right season.
  for d in
    select p.day from our_misses_private.prove p
    where p.settled_at is null and p.finished_at is not null
    group by p.day
    having p.day < today or count(*) = 2
  loop
    insert into public.our_misses_events (player, kind, points, created_at)
    select p.player, 'prove_it', p.level, p.finished_at from our_misses_private.prove p
    where p.day = d.day and p.settled_at is null and p.finished_at is not null and p.passed;
    update our_misses_private.prove set settled_at = t
    where day = d.day and settled_at is null and finished_at is not null;
  end loop;

  -- A VS game not reported a minute after its time is up is closed with what was reported.
  perform our_misses_private.settle_duel(x.id, t)
  from our_misses_private.duels x
  where x.settled_at is null and x.starts_at < t - our_misses_private.vs_length(x.game) - interval '60 seconds';
end;
$$;

-- One day's claims, hiding the partner's until the day is revealed.
create function our_misses_private.prove_day(p_day date, me text)
returns jsonb language sql stable set search_path = ''
as $$
  with rows as (select * from our_misses_private.prove where day = p_day),
  shown as (select coalesce(bool_or(settled_at is not null), false) as revealed from rows)
  select case when p_day is null then null else jsonb_build_object(
    'day', p_day,
    'revealed', shown.revealed,
    'Aleem', (select case when r.player = me or shown.revealed
                then jsonb_build_object('level', r.level, 'target', our_misses_private.prove_target(r.level),
                       'score', r.score, 'passed', r.passed, 'finished', r.finished_at is not null,
                       'started_at', r.started_at)
                else jsonb_build_object('finished', r.finished_at is not null) end
              from rows r where r.player = 'Aleem'),
    'Nurul', (select case when r.player = me or shown.revealed
                then jsonb_build_object('level', r.level, 'target', our_misses_private.prove_target(r.level),
                       'score', r.score, 'passed', r.passed, 'finished', r.finished_at is not null,
                       'started_at', r.started_at)
                else jsonb_build_object('finished', r.finished_at is not null) end
              from rows r where r.player = 'Nurul')
  ) end from shown;
$$;

revoke all on all functions in schema our_misses_private from public, anon, authenticated;
grant execute on function our_misses_private.is_member() to authenticated;
grant execute on function our_misses_private.my_player() to authenticated;

-- RPCs ------------------------------------------------------------------------------------
create or replace function public.our_misses_status()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  perform our_misses_private.settle(t);
  return jsonb_build_object(
    'me', me,
    'now', t,
    'week_start', our_misses_private.week_of(t),
    'hearts', (select jsonb_object_agg(h.player, our_misses_private.hearts_at(h.stored, h.refilled_at, t))
               from public.our_misses_hearts h)
  );
end;
$$;

create function public.our_misses_prove_today()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  today date := our_misses_private.day_of(t);
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  perform our_misses_private.settle(t);
  return jsonb_build_object(
    'now', t,
    'day', today,
    'today', our_misses_private.prove_day(today, me),
    'last', our_misses_private.prove_day(
      (select max(p.day) from our_misses_private.prove p where p.day < today), me)
  );
end;
$$;

-- Lock in today's claim and start the clock. One attempt a day; walking away is a bluff.
create function public.our_misses_prove_start(p_level int)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_level is null or p_level not between 1 and 7 then
    raise exception 'level must be 1 to 7' using errcode = '22023';
  end if;
  perform our_misses_private.settle(t);
  insert into our_misses_private.prove (player, day, level, started_at)
  values (me, our_misses_private.day_of(t), p_level, t)
  on conflict do nothing;
  if not found then
    raise exception 'already proved it today' using errcode = 'P0001';
  end if;
  return jsonb_build_object('level', p_level, 'target', our_misses_private.prove_target(p_level), 'started_at', t);
end;
$$;

create function public.our_misses_prove_finish(p_score int)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  r our_misses_private.prove%rowtype;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_score is null or p_score not between 0 and 80 then
    raise exception 'score must be 0 to 80' using errcode = '22023';
  end if;
  select * into r from our_misses_private.prove
  where player = me and finished_at is null
  order by started_at desc limit 1 for update;
  if not found or t > r.started_at + interval '2 minutes' then
    raise exception 'no game in progress' using errcode = 'P0001';
  end if;
  if t < r.started_at + interval '18 seconds' then
    raise exception 'the game is not over yet' using errcode = '22023';
  end if;
  update our_misses_private.prove
  set score = p_score, finished_at = t, passed = p_score >= our_misses_private.prove_target(r.level)
  where player = r.player and day = r.day;
  return public.our_misses_prove_today();
end;
$$;

-- The one who accepts a challenge starts the game; it begins 4 s later on both phones.
create function public.our_misses_duel_start(p_game text default 'tug')
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  d our_misses_private.duels%rowtype;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_game is null or p_game not in ('tug', 'pour') then
    raise exception 'unknown game' using errcode = '22023';
  end if;
  perform our_misses_private.settle(t);
  if exists (select 1 from our_misses_private.duels where settled_at is null) then
    raise exception 'a duel is already on' using errcode = 'P0001';
  end if;
  insert into our_misses_private.duels (game, seed, started_by, starts_at)
  values (p_game, floor(random() * 2000000000)::int, me, t + interval '4 seconds') returning * into d;
  return our_misses_private.duel_json(d);
end;
$$;

-- Report once you are done: taps for tug; for pour, whether you solved it (the clock here
-- decides how fast) or how many bottles you completed. Settles once both have reported.
create function public.our_misses_duel_finish(p_id bigint, p_score int, p_solved boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  d our_misses_private.duels%rowtype;
  v int;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_score is null or p_score not between 0 and 300 then
    raise exception 'score must be 0 to 300' using errcode = '22023';
  end if;
  perform our_misses_private.settle(t);
  select * into d from our_misses_private.duels where id = p_id for update;
  if not found then
    raise exception 'no such duel' using errcode = 'P0001';
  end if;
  if d.settled_at is null then
    if d.game = 'tug' and t < d.starts_at + interval '14 seconds' then
      raise exception 'the duel is not over yet' using errcode = '22023';
    end if;
    if d.game = 'pour' and t < d.starts_at then
      raise exception 'the race is not over yet' using errcode = '22023';
    end if;
    if d.game = 'pour' and coalesce(p_solved, false) and t < d.starts_at + interval '8 seconds' then
      raise exception 'too fast to be true' using errcode = '22023';
    end if;
    v := case
      when d.game = 'tug' then p_score
      when coalesce(p_solved, false) then 1000000 - least(999999, floor(extract(epoch from (t - d.starts_at)) * 1000)::int)
      else least(p_score, 20)
    end;
    update our_misses_private.duels set
      aleem_score = case when me = 'Aleem' then coalesce(aleem_score, v) else aleem_score end,
      nurul_score = case when me = 'Nurul' then coalesce(nurul_score, v) else nurul_score end
    where id = p_id returning * into d;
    if d.aleem_score is not null and d.nurul_score is not null then
      perform our_misses_private.settle_duel(p_id, t);
    end if;
  end if;
  select * into d from our_misses_private.duels where id = p_id;
  return our_misses_private.duel_json(d);
end;
$$;

create function public.our_misses_duel_get(p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  d our_misses_private.duels%rowtype;
begin
  if not our_misses_private.is_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  perform our_misses_private.settle(our_misses_private.clock());
  select * into d from our_misses_private.duels where id = p_id;
  if not found then
    raise exception 'no such duel' using errcode = 'P0001';
  end if;
  return our_misses_private.duel_json(d);
end;
$$;

-- The history board gains Prove It and Duel columns.
drop function public.our_misses_weeks();
create function public.our_misses_weeks()
returns table (
  week_start date, aleem int, nurul int,
  aleem_misses int, nurul_misses int, same_brains int, longest_rally int,
  aleem_proven int, nurul_proven int, aleem_bluffs int, nurul_bluffs int,
  aleem_duels int, nurul_duels int
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not our_misses_private.is_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return query
    with ev as (
      select our_misses_private.week_of(e.created_at) as w,
             coalesce(sum(e.points) filter (where e.player = 'Aleem'), 0)::int as aleem,
             coalesce(sum(e.points) filter (where e.player = 'Nurul'), 0)::int as nurul,
             (count(*) filter (where e.kind = 'miss' and e.player = 'Aleem'))::int as aleem_misses,
             (count(*) filter (where e.kind = 'miss' and e.player = 'Nurul'))::int as nurul_misses,
             (count(*) filter (where e.kind = 'same_brain') / 2)::int as same_brains,
             coalesce(max(e.rally_length), 0)::int as longest_rally,
             (count(*) filter (where e.kind = 'prove_it' and e.player = 'Aleem'))::int as aleem_proven,
             (count(*) filter (where e.kind = 'prove_it' and e.player = 'Nurul'))::int as nurul_proven,
             (count(*) filter (where e.kind = 'duel' and e.player = 'Aleem'))::int as aleem_duels,
             (count(*) filter (where e.kind = 'duel' and e.player = 'Nurul'))::int as nurul_duels
      from public.our_misses_events e group by 1
    ), bl as (
      select date_trunc('week', p.day)::date as w,
             (count(*) filter (where p.player = 'Aleem'))::int as aleem_bluffs,
             (count(*) filter (where p.player = 'Nurul'))::int as nurul_bluffs
      from our_misses_private.prove p
      where p.settled_at is not null and not p.passed
      group by 1
    )
    select coalesce(ev.w, bl.w),
           coalesce(ev.aleem, 0), coalesce(ev.nurul, 0),
           coalesce(ev.aleem_misses, 0), coalesce(ev.nurul_misses, 0),
           coalesce(ev.same_brains, 0), coalesce(ev.longest_rally, 0),
           coalesce(ev.aleem_proven, 0), coalesce(ev.nurul_proven, 0),
           coalesce(bl.aleem_bluffs, 0), coalesce(bl.nurul_bluffs, 0),
           coalesce(ev.aleem_duels, 0), coalesce(ev.nurul_duels, 0)
    from ev full join bl on ev.w = bl.w
    order by 1 desc;
end;
$$;

revoke all on function public.our_misses_prove_today() from public, anon, authenticated;
revoke all on function public.our_misses_prove_start(int) from public, anon, authenticated;
revoke all on function public.our_misses_prove_finish(int) from public, anon, authenticated;
revoke all on function public.our_misses_duel_start(text) from public, anon, authenticated;
revoke all on function public.our_misses_duel_finish(bigint, int, boolean) from public, anon, authenticated;
revoke all on function public.our_misses_duel_get(bigint) from public, anon, authenticated;
revoke all on function public.our_misses_weeks() from public, anon, authenticated;
grant execute on function public.our_misses_prove_today() to authenticated;
grant execute on function public.our_misses_prove_start(int) to authenticated;
grant execute on function public.our_misses_prove_finish(int) to authenticated;
grant execute on function public.our_misses_duel_start(text) to authenticated;
grant execute on function public.our_misses_duel_finish(bigint, int, boolean) to authenticated;
grant execute on function public.our_misses_duel_get(bigint) to authenticated;
grant execute on function public.our_misses_weeks() to authenticated;

commit;
