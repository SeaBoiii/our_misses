-- Batch 1 of the rotation's new games:
--   Heart to Heart (daily): answer the same our_hearts question in writing; both shown once both have.
--   Agak Agak (daily): the Psychic clues a hidden spot on a spectrum; the other sets the needle.
--   Kopi Rush (versus): the same kopitiam orders on both phones for 60 seconds; most right wins.
--   Scissors-Paper-Stone (versus): best of 5, every throw locked in here before either is shown.
--   Cannot Say! (together): describe in typed clues without the banned words; each word is a miss.
-- And a 28-day lineup: one daily game plus three versus games and one together game each day.
begin;

-- New kinds of misses ----------------------------------------------------------------------
alter table public.our_misses_events drop constraint our_misses_events_kind_check;
alter table public.our_misses_events add constraint our_misses_events_kind_check
  check (kind in ('miss', 'same_brain', 'prove_it', 'duel', 'hands', 'tot', 'rally', 'hth', 'agak', 'cannot'));
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
  or (kind in ('hands', 'rally', 'hth', 'agak', 'cannot') and charge is null and rally_length is null and ref_id is null
    and rally_bonus = 0 and points between 1 and 6)
  or (kind = 'tot' and charge is null and rally_length is null and ref_id is null
    and rally_bonus = 0 and points between 1 and 3)
);

-- The 28-day lineup --------------------------------------------------------------------------
-- Mirrored in src/game/lineup.ts (a test compares the two). Edit both, keep the markers.
-- lineup:start
create or replace function our_misses_private.lineup(p_day date)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'day', p_day,
    'daily', (array['tot', 'hth', 'prove', 'agak', 'prove', 'hth', 'agak', 'tot', 'hth', 'prove', 'agak', 'tot', 'prove', 'tot', 'agak', 'hth', 'tot', 'agak', 'prove', 'hth', 'prove', 'tot', 'hth', 'agak', 'tot', 'prove', 'agak', 'hth'])[x.i + 1],
    'play', (array[
      '["quiz", "kopi", "tug", "chapteh"]'::jsonb,
      '["mrt", "pour", "sps", "cannot"]'::jsonb,
      '["kopi", "mrt", "sps", "chapteh"]'::jsonb,
      '["quiz", "tug", "pour", "cannot"]'::jsonb,
      '["sps", "quiz", "pour", "chapteh"]'::jsonb,
      '["tug", "mrt", "kopi", "cannot"]'::jsonb,
      '["pour", "quiz", "mrt", "chapteh"]'::jsonb,
      '["sps", "kopi", "tug", "cannot"]'::jsonb,
      '["quiz", "tug", "mrt", "chapteh"]'::jsonb,
      '["kopi", "pour", "sps", "cannot"]'::jsonb,
      '["tug", "kopi", "pour", "chapteh"]'::jsonb,
      '["quiz", "mrt", "sps", "cannot"]'::jsonb,
      '["mrt", "tug", "sps", "chapteh"]'::jsonb,
      '["pour", "kopi", "quiz", "cannot"]'::jsonb,
      '["tug", "sps", "pour", "chapteh"]'::jsonb,
      '["kopi", "mrt", "quiz", "cannot"]'::jsonb,
      '["mrt", "pour", "kopi", "chapteh"]'::jsonb,
      '["sps", "tug", "quiz", "cannot"]'::jsonb,
      '["tug", "mrt", "pour", "chapteh"]'::jsonb,
      '["kopi", "quiz", "sps", "cannot"]'::jsonb,
      '["kopi", "sps", "mrt", "chapteh"]'::jsonb,
      '["pour", "quiz", "tug", "cannot"]'::jsonb,
      '["pour", "tug", "kopi", "chapteh"]'::jsonb,
      '["mrt", "sps", "quiz", "cannot"]'::jsonb,
      '["pour", "mrt", "quiz", "chapteh"]'::jsonb,
      '["sps", "kopi", "tug", "cannot"]'::jsonb,
      '["sps", "tug", "mrt", "chapteh"]'::jsonb,
      '["quiz", "kopi", "pour", "cannot"]'::jsonb
    ])[x.i + 1])
  from (select ((p_day - date '1970-01-01') % 28) as i) x;
$$;
-- lineup:end

create or replace function our_misses_private.on_today(p_game text, t timestamptz)
returns boolean language sql stable set search_path = ''
as $$
  select case when p_game in ('prove', 'tot', 'hth', 'agak')
    then our_misses_private.lineup(our_misses_private.day_of(t)) ->> 'daily' = p_game
    else our_misses_private.lineup(our_misses_private.day_of(t)) -> 'play' ? p_game end;
$$;

-- Heart to Heart -----------------------------------------------------------------------------
create table our_misses_private.hth (
  day date not null,
  player text not null check (player in ('Aleem', 'Nurul')),
  question text not null check (length(question) between 1 and 40),
  answer text not null check (length(btrim(answer)) between 1 and 600),
  answered_at timestamptz not null,
  settled_at timestamptz,
  primary key (day, player)
);
alter table our_misses_private.hth enable row level security;
revoke all on our_misses_private.hth from public, anon, authenticated;

-- One day's answers; the other's stays hidden until you've both answered.
create function our_misses_private.hth_day(p_day date, me text)
returns jsonb language sql stable set search_path = ''
as $$
  with rows as (select * from our_misses_private.hth where day = p_day),
  shown as (select count(*) = 2 as revealed from rows)
  select jsonb_build_object(
    'day', p_day,
    'revealed', shown.revealed,
    'Aleem', (select case when r.player = me or shown.revealed
                then jsonb_build_object('question', r.question, 'answer', r.answer)
                else jsonb_build_object('answered', true) end
              from rows r where r.player = 'Aleem'),
    'Nurul', (select case when r.player = me or shown.revealed
                then jsonb_build_object('question', r.question, 'answer', r.answer)
                else jsonb_build_object('answered', true) end
              from rows r where r.player = 'Nurul')
  ) from shown;
$$;

create function public.our_misses_hth_today()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return jsonb_build_object('now', t, 'day', our_misses_private.day_of(t),
    'today', our_misses_private.hth_day(our_misses_private.day_of(t), me));
end;
$$;

-- When the second answer arrives, it's +2 for each of you.
create function public.our_misses_hth_answer(p_question text, p_answer text)
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
  if p_question is null or length(p_question) not between 1 and 40
     or p_answer is null or length(btrim(p_answer)) not between 1 and 600 then
    raise exception 'write 1 to 600 characters' using errcode = '22023';
  end if;
  if not our_misses_private.on_today('hth', t) then
    raise exception 'Heart to Heart is not on today' using errcode = 'P0001';
  end if;
  insert into our_misses_private.hth (day, player, question, answer, answered_at)
  values (today, me, p_question, btrim(p_answer), t)
  on conflict do nothing;
  if not found then
    raise exception 'already answered today' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('our_misses_hth'));
  if (select count(*) from our_misses_private.hth where day = today and settled_at is null) = 2 then
    insert into public.our_misses_events (player, kind, points, created_at)
    values ('Aleem', 'hth', 2, t), ('Nurul', 'hth', 2, t);
    update our_misses_private.hth set settled_at = t where day = today;
  end if;
  return public.our_misses_hth_today();
end;
$$;

create function public.our_misses_hth_album(p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(our_misses_private.hth_day(d.day, me) order by d.day desc)
    from (select day from our_misses_private.hth group by day having count(*) = 2
          order by day desc limit least(greatest(coalesce(p_limit, 60), 1), 365)) d
  ), '[]'::jsonb);
end;
$$;

-- Agak Agak --------------------------------------------------------------------------------
-- Dial 0-180 degrees. Scoring bands of 6.5 degrees (from Agak Agak): within 3.25 = 4,
-- 9.75 = 3, 16.25 = 2, else 0. Points go to both of you: you score together.
create table our_misses_private.agak (
  day date primary key,
  psychic text not null check (psychic in ('Aleem', 'Nurul')),
  card text not null check (length(card) between 1 and 40),
  target numeric(6, 2) not null check (target between 16.25 and 163.75),
  clue text check (length(btrim(clue)) between 1 and 80),
  clue_at timestamptz,
  needle numeric(6, 2) check (needle between 0 and 180),
  score smallint check (score in (0, 2, 3, 4)),
  guessed_at timestamptz
);
alter table our_misses_private.agak enable row level security;
revoke all on our_misses_private.agak from public, anon, authenticated;

create function our_misses_private.agak_json(a our_misses_private.agak, me text)
returns jsonb language sql stable set search_path = ''
as $$
  select case when a.day is null then null else jsonb_build_object(
    'day', a.day, 'psychic', a.psychic, 'card', a.card, 'clue', a.clue,
    'needle', a.needle, 'score', a.score,
    -- The target stays secret from the guesser until the needle is set.
    'target', case when a.psychic = me or a.guessed_at is not null then a.target end
  ) end;
$$;

-- Today's round, dealt the first time either of you opens it on an Agak Agak day. The
-- Psychic alternates: whoever guessed last time clues this time. Cards are agak-1..agak-99.
create function public.our_misses_agak_today()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  today date := our_misses_private.day_of(t);
  a our_misses_private.agak%rowtype;
  last_psychic text;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select * into a from our_misses_private.agak where day = today;
  if not found and our_misses_private.on_today('agak', t) then
    select x.psychic into last_psychic from our_misses_private.agak x where x.day < today order by x.day desc limit 1;
    insert into our_misses_private.agak (day, psychic, card, target)
    values (today, case when last_psychic = 'Aleem' then 'Nurul' else 'Aleem' end,
            'agak-' || (1 + floor(random() * 99))::int,
            round((16.25 + random() * 147.5)::numeric, 2))
    on conflict (day) do nothing;
    select * into a from our_misses_private.agak where day = today;
  end if;
  return jsonb_build_object('now', t, 'day', today, 'today', our_misses_private.agak_json(a, me),
    'last', (select our_misses_private.agak_json(x, me) from our_misses_private.agak x
             where x.day < today and x.guessed_at is not null order by x.day desc limit 1));
end;
$$;

create function public.our_misses_agak_clue(p_clue text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_clue is null or length(btrim(p_clue)) not between 1 and 80 then
    raise exception 'a clue is 1 to 80 characters' using errcode = '22023';
  end if;
  update our_misses_private.agak set clue = btrim(p_clue), clue_at = t
  where day = our_misses_private.day_of(t) and psychic = me and clue is null;
  if not found then
    raise exception 'only today''s Psychic can give one clue' using errcode = 'P0001';
  end if;
  return public.our_misses_agak_today();
end;
$$;

create function public.our_misses_agak_guess(p_needle numeric)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  a our_misses_private.agak%rowtype;
  d numeric;
  s int;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_needle is null or p_needle not between 0 and 180 then
    raise exception 'the needle goes from 0 to 180' using errcode = '22023';
  end if;
  select * into a from our_misses_private.agak
  where day = our_misses_private.day_of(t) and psychic <> me and clue is not null and guessed_at is null
  for update;
  if not found then
    raise exception 'nothing to guess yet' using errcode = 'P0001';
  end if;
  d := abs(a.target - p_needle);
  s := case when d <= 3.25 then 4 when d <= 9.75 then 3 when d <= 16.25 then 2 else 0 end;
  update our_misses_private.agak set needle = round(p_needle, 2), score = s, guessed_at = t where day = a.day;
  if s > 0 then
    insert into public.our_misses_events (player, kind, points, created_at)
    values ('Aleem', 'agak', s, t), ('Nurul', 'agak', s, t);
  end if;
  return public.our_misses_agak_today();
end;
$$;

-- Kopi Rush, Scissors-Paper-Stone and Cannot Say! join the VS games ---------------------------
alter table our_misses_private.duels drop constraint duels_game_check;
alter table our_misses_private.duels add constraint duels_game_check
  check (game in ('tug', 'pour', 'quiz', 'chapteh', 'mrt', 'kopi', 'sps', 'cannot'));

create or replace function our_misses_private.vs_length(game text)
returns interval language sql immutable set search_path = ''
as $$
  select case game
    when 'pour' then interval '180 seconds'
    when 'quiz' then interval '110 seconds'
    when 'mrt' then interval '110 seconds'
    when 'chapteh' then interval '300 seconds'
    when 'kopi' then interval '60 seconds'
    when 'sps' then interval '120 seconds'
    when 'cannot' then interval '90 seconds'
    else interval '15 seconds' end;
$$;

-- Scissors-Paper-Stone throws. Each is stored before either of you sees the other's.
create table our_misses_private.sps (
  duel_id bigint not null references our_misses_private.duels(id) on delete cascade,
  round smallint not null check (round between 1 and 9),
  player text not null check (player in ('Aleem', 'Nurul')),
  throw text not null check (throw in ('scissors', 'paper', 'stone')),
  thrown_at timestamptz not null,
  primary key (duel_id, round, player)
);
alter table our_misses_private.sps enable row level security;
revoke all on our_misses_private.sps from public, anon, authenticated;

create function our_misses_private.sps_beats(a text, b text)
returns boolean language sql immutable set search_path = ''
as $$ select (a, b) in (('scissors', 'paper'), ('paper', 'stone'), ('stone', 'scissors')); $$;

-- Every round both of you have thrown, the round you're on, and the wins so far.
-- First to 3 wins; ties don't count; it ends after 9 rounds either way.
create function our_misses_private.sps_state(p_id bigint, me text)
returns jsonb language sql stable set search_path = ''
as $$
  with r as (
    select m.round, m.throw as mine, o.throw as theirs
    from our_misses_private.sps m
    left join our_misses_private.sps o on o.duel_id = m.duel_id and o.round = m.round and o.player <> me
    where m.duel_id = p_id and m.player = me
  ), done as (
    select round, mine, theirs,
           case when our_misses_private.sps_beats(mine, theirs) then 'me'
                when our_misses_private.sps_beats(theirs, mine) then 'them' else 'tie' end as winner
    from r where theirs is not null
  ), wins as (
    select count(*) filter (where winner = 'me') as me, count(*) filter (where winner = 'them') as them,
           count(*) as played from done
  )
  select jsonb_build_object(
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('round', round, 'mine', mine, 'theirs', theirs, 'winner', winner) order by round) from done), '[]'::jsonb),
    'waiting', (select count(*) from r where theirs is null) > 0,
    'next', (select count(*) from r) + 1,
    'mine', wins.me, 'theirs', wins.them,
    'over', wins.me >= 3 or wins.them >= 3 or wins.played >= 9)
  from wins;
$$;

create function public.our_misses_sps_throw(p_id bigint, p_round int, p_throw text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  d our_misses_private.duels%rowtype;
  state jsonb;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_throw is null or p_throw not in ('scissors', 'paper', 'stone') then
    raise exception 'scissors, paper or stone' using errcode = '22023';
  end if;
  select * into d from our_misses_private.duels where id = p_id and game = 'sps' for update;
  if not found or d.settled_at is not null or t < d.starts_at or t > d.starts_at + interval '120 seconds' then
    raise exception 'no game to throw in' using errcode = 'P0001';
  end if;
  state := our_misses_private.sps_state(p_id, me);
  if (state ->> 'over')::boolean or p_round <> (state ->> 'next')::int then
    raise exception 'not that round' using errcode = 'P0001';
  end if;
  -- You can't run more than one round ahead of the other phone.
  if (select count(*) from our_misses_private.sps where duel_id = p_id and player <> me) < p_round - 1 then
    raise exception 'wait for the other throw' using errcode = 'P0001';
  end if;
  insert into our_misses_private.sps (duel_id, round, player, throw, thrown_at) values (p_id, p_round, me, p_throw, t);
  return our_misses_private.sps_state(p_id, me);
end;
$$;

create function public.our_misses_sps_get(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return our_misses_private.sps_state(p_id, me);
end;
$$;

create or replace function our_misses_private.settle_duel(p_id bigint, t timestamptz)
returns void language plpgsql set search_path = ''
as $$
declare
  d our_misses_private.duels%rowtype;
  a int;
  n int;
  w text;
  paid boolean;
  together int;
  ev_kind text;
  per_game int;
  p text;
  today int;
  earned int;
begin
  select * into d from our_misses_private.duels where id = p_id and settled_at is null for update;
  if not found then return; end if;
  if d.game = 'sps' then
    -- Scissors-Paper-Stone is scored from the throws held here, never from what a phone says.
    a := (our_misses_private.sps_state(p_id, 'Aleem') ->> 'mine')::int;
    n := (our_misses_private.sps_state(p_id, 'Nurul') ->> 'mine')::int;
  else
    a := coalesce(d.aleem_score, 0);
    n := coalesce(d.nurul_score, 0);
  end if;

  if d.game in ('chapteh', 'cannot') then
    -- Together: nobody wins. It counts only as far as both phones agree.
    together := least(a, n);
    ev_kind := case d.game when 'chapteh' then 'rally' else 'cannot' end;
    update our_misses_private.duels set aleem_score = a, nurul_score = n, winner = 'tie', points = 0, settled_at = t
    where id = p_id;
    foreach p in array array['Aleem', 'Nurul'] loop
      select coalesce(sum(e.points), 0)::int into today from public.our_misses_events e
      where e.kind = ev_kind and e.player = p
        and our_misses_private.day_of(e.created_at) = our_misses_private.day_of(t);
      -- Chapteh: every 4 kicks is a miss. Cannot Say!: every word is. 6 a game, 12 a day.
      per_game := case d.game when 'chapteh' then together / 4 else together end;
      earned := greatest(0, least(per_game, 6, 12 - today));
      if earned > 0 then
        insert into public.our_misses_events (player, kind, points, created_at) values (p, ev_kind, earned, t);
      end if;
    end loop;
    return;
  end if;

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

create or replace function public.our_misses_duel_start(p_game text default 'tug')
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
  if p_game is null or p_game not in ('tug', 'pour', 'quiz', 'chapteh', 'mrt', 'kopi', 'sps', 'cannot') then
    raise exception 'unknown game' using errcode = '22023';
  end if;
  if not our_misses_private.on_today(p_game, t) then
    raise exception 'that game is not on today' using errcode = 'P0001';
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

create or replace function public.our_misses_duel_finish(p_id bigint, p_score int, p_solved boolean default false)
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
  if p_score is null or p_score not between 0 and 2000 then
    raise exception 'score must be 0 to 2000' using errcode = '22023';
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
    if d.game in ('pour', 'chapteh') and t < d.starts_at then
      raise exception 'the race is not over yet' using errcode = '22023';
    end if;
    if d.game = 'sps' and t < d.starts_at + interval '120 seconds'
       and not (our_misses_private.sps_state(p_id, me) ->> 'over')::boolean then
      raise exception 'the match is not over yet' using errcode = '22023';
    end if;
    if d.game in ('quiz', 'mrt') and t < d.starts_at + interval '7 seconds' then
      raise exception 'the quiz is not over yet' using errcode = '22023';
    end if;
    if d.game = 'kopi' and t < d.starts_at + interval '55 seconds' then
      raise exception 'the shift is not over yet' using errcode = '22023';
    end if;
    if d.game = 'cannot' and t < d.starts_at + interval '85 seconds' then
      raise exception 'the round is not over yet' using errcode = '22023';
    end if;
    if d.game = 'pour' and coalesce(p_solved, false) and t < d.starts_at + interval '8 seconds' then
      raise exception 'too fast to be true' using errcode = '22023';
    end if;
    v := case
      when d.game = 'tug' then least(p_score, 300)
      when d.game in ('quiz', 'mrt') then least(p_score, 1540)
      when d.game = 'chapteh' then least(p_score, 500)
      when d.game = 'kopi' then least(p_score, 40)
      when d.game = 'cannot' then least(p_score, 60)
      -- Scissors-Paper-Stone: the database counts your wins from the throws it holds.
      when d.game = 'sps' then (our_misses_private.sps_state(p_id, me) ->> 'mine')::int
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

-- The history board gains Heart to Heart, Agak Agak and Cannot Say! columns.
drop function public.our_misses_weeks();
create function public.our_misses_weeks()
returns table (
  week_start date, aleem int, nurul int,
  aleem_misses int, nurul_misses int, same_brains int, longest_rally int,
  aleem_proven int, nurul_proven int, aleem_bluffs int, nurul_bluffs int,
  aleem_duels int, nurul_duels int,
  hands int, tot int, best_chapteh int,
  hth int, agak int, cannot int
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
             (count(*) filter (where e.kind = 'duel' and e.player = 'Nurul'))::int as nurul_duels,
             coalesce(sum(e.points) filter (where e.kind = 'hands'), 0)::int as hands,
             coalesce(sum(e.points) filter (where e.kind = 'tot'), 0)::int as tot,
             coalesce(sum(e.points) filter (where e.kind = 'hth'), 0)::int as hth,
             coalesce(sum(e.points) filter (where e.kind = 'agak'), 0)::int as agak,
             coalesce(sum(e.points) filter (where e.kind = 'cannot'), 0)::int as cannot
      from public.our_misses_events e group by 1
    ), bl as (
      select date_trunc('week', p.day)::date as w,
             (count(*) filter (where p.player = 'Aleem'))::int as aleem_bluffs,
             (count(*) filter (where p.player = 'Nurul'))::int as nurul_bluffs
      from our_misses_private.prove p
      where p.settled_at is not null and not p.passed
      group by 1
    ), ch as (
      select our_misses_private.week_of(x.starts_at) as w,
             max(least(x.aleem_score, x.nurul_score))::int as best_chapteh
      from our_misses_private.duels x
      where x.game = 'chapteh' and x.settled_at is not null
      group by 1
    ), wk as (
      select w from ev union select w from bl union select w from ch
    )
    select wk.w,
           coalesce(ev.aleem, 0), coalesce(ev.nurul, 0),
           coalesce(ev.aleem_misses, 0), coalesce(ev.nurul_misses, 0),
           coalesce(ev.same_brains, 0), coalesce(ev.longest_rally, 0),
           coalesce(ev.aleem_proven, 0), coalesce(ev.nurul_proven, 0),
           coalesce(bl.aleem_bluffs, 0), coalesce(bl.nurul_bluffs, 0),
           coalesce(ev.aleem_duels, 0), coalesce(ev.nurul_duels, 0),
           coalesce(ev.hands, 0), coalesce(ev.tot, 0), coalesce(ch.best_chapteh, 0),
           coalesce(ev.hth, 0), coalesce(ev.agak, 0), coalesce(ev.cannot, 0)
    from wk
    left join ev on ev.w = wk.w
    left join bl on bl.w = wk.w
    left join ch on ch.w = wk.w
    order by 1 desc;
end;
$$;

revoke all on all functions in schema our_misses_private from public, anon, authenticated;
grant execute on function our_misses_private.is_member() to authenticated;
grant execute on function our_misses_private.my_player() to authenticated;

revoke all on function public.our_misses_hth_today() from public, anon, authenticated;
revoke all on function public.our_misses_hth_answer(text, text) from public, anon, authenticated;
revoke all on function public.our_misses_hth_album(int) from public, anon, authenticated;
revoke all on function public.our_misses_agak_today() from public, anon, authenticated;
revoke all on function public.our_misses_agak_clue(text) from public, anon, authenticated;
revoke all on function public.our_misses_agak_guess(numeric) from public, anon, authenticated;
revoke all on function public.our_misses_sps_throw(bigint, int, text) from public, anon, authenticated;
revoke all on function public.our_misses_sps_get(bigint) from public, anon, authenticated;
revoke all on function public.our_misses_weeks() from public, anon, authenticated;
grant execute on function public.our_misses_hth_today() to authenticated;
grant execute on function public.our_misses_hth_answer(text, text) to authenticated;
grant execute on function public.our_misses_hth_album(int) to authenticated;
grant execute on function public.our_misses_agak_today() to authenticated;
grant execute on function public.our_misses_agak_clue(text) to authenticated;
grant execute on function public.our_misses_agak_guess(numeric) to authenticated;
grant execute on function public.our_misses_sps_throw(bigint, int, text) to authenticated;
grant execute on function public.our_misses_sps_get(bigint) to authenticated;
grant execute on function public.our_misses_weeks() to authenticated;

commit;
