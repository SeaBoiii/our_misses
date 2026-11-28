-- Batch 2 of the rotation's new games:
--   Doodle Day (daily): 30 seconds to draw today's prompt; both doodles shown once both are in.
--   Marina Mini Golf (versus): the same 3 holes on both phones; fewest strokes wins.
--   Chope Wars (versus): turn by turn across the two phones; every move is stored here in order.
--   Draw & Guess (together): one draws live, the other guesses; swap halfway.
--   In Sync (together): tap the same rhythm; every beat you both hit counts.
-- And a 40-day lineup: one daily game plus three versus games and one together game each day.
begin;

-- New kinds of misses ----------------------------------------------------------------------
alter table public.our_misses_events drop constraint our_misses_events_kind_check;
alter table public.our_misses_events add constraint our_misses_events_kind_check
  check (kind in ('miss', 'same_brain', 'prove_it', 'duel', 'hands', 'tot', 'rally', 'hth', 'agak', 'cannot',
                  'doodle', 'draw', 'sync'));
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
  or (kind in ('hands', 'rally', 'hth', 'agak', 'cannot', 'doodle', 'draw', 'sync') and charge is null
    and rally_length is null and ref_id is null and rally_bonus = 0 and points between 1 and 6)
  or (kind = 'tot' and charge is null and rally_length is null and ref_id is null
    and rally_bonus = 0 and points between 1 and 3)
);

-- The 40-day lineup --------------------------------------------------------------------------
-- Mirrored in src/game/lineup.ts (a test compares the two). Edit both, keep the markers.
-- lineup:start
create or replace function our_misses_private.lineup(p_day date)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'day', p_day,
    'daily', (array['prove', 'doodle', 'agak', 'tot', 'hth', 'agak', 'hth', 'prove', 'tot', 'doodle', 'prove', 'doodle', 'hth', 'tot', 'agak', 'prove', 'agak', 'tot', 'doodle', 'hth', 'agak', 'doodle', 'hth', 'prove', 'tot', 'agak', 'doodle', 'tot', 'prove', 'hth', 'tot', 'prove', 'agak', 'hth', 'doodle', 'hth', 'tot', 'prove', 'doodle', 'agak'])[x.i + 1],
    'play', (array[
      '["pour", "quiz", "sps", "draw"]'::jsonb,
      '["kopi", "chope", "tug", "cannot"]'::jsonb,
      '["golf", "mrt", "kopi", "chapteh"]'::jsonb,
      '["chope", "golf", "sps", "sync"]'::jsonb,
      '["quiz", "tug", "mrt", "draw"]'::jsonb,
      '["pour", "mrt", "chope", "chapteh"]'::jsonb,
      '["kopi", "golf", "quiz", "sync"]'::jsonb,
      '["tug", "pour", "sps", "cannot"]'::jsonb,
      '["sps", "mrt", "chope", "chapteh"]'::jsonb,
      '["tug", "pour", "quiz", "sync"]'::jsonb,
      '["golf", "kopi", "mrt", "draw"]'::jsonb,
      '["quiz", "sps", "golf", "cannot"]'::jsonb,
      '["pour", "tug", "kopi", "draw"]'::jsonb,
      '["chope", "golf", "pour", "sync"]'::jsonb,
      '["mrt", "kopi", "chope", "cannot"]'::jsonb,
      '["tug", "sps", "quiz", "chapteh"]'::jsonb,
      '["golf", "sps", "pour", "draw"]'::jsonb,
      '["quiz", "mrt", "kopi", "chapteh"]'::jsonb,
      '["chope", "tug", "golf", "sync"]'::jsonb,
      '["sps", "quiz", "chope", "cannot"]'::jsonb,
      '["tug", "kopi", "mrt", "sync"]'::jsonb,
      '["pour", "quiz", "kopi", "cannot"]'::jsonb,
      '["sps", "golf", "pour", "draw"]'::jsonb,
      '["chope", "tug", "mrt", "chapteh"]'::jsonb,
      '["quiz", "golf", "tug", "draw"]'::jsonb,
      '["pour", "chope", "kopi", "cannot"]'::jsonb,
      '["mrt", "sps", "pour", "chapteh"]'::jsonb,
      '["kopi", "quiz", "chope", "sync"]'::jsonb,
      '["sps", "golf", "tug", "draw"]'::jsonb,
      '["mrt", "tug", "pour", "sync"]'::jsonb,
      '["sps", "chope", "golf", "cannot"]'::jsonb,
      '["mrt", "kopi", "quiz", "chapteh"]'::jsonb,
      '["kopi", "sps", "tug", "sync"]'::jsonb,
      '["chope", "pour", "mrt", "draw"]'::jsonb,
      '["quiz", "golf", "chope", "chapteh"]'::jsonb,
      '["pour", "kopi", "tug", "cannot"]'::jsonb,
      '["sps", "golf", "quiz", "chapteh"]'::jsonb,
      '["mrt", "quiz", "chope", "draw"]'::jsonb,
      '["sps", "kopi", "pour", "sync"]'::jsonb,
      '["golf", "mrt", "tug", "cannot"]'::jsonb
    ])[x.i + 1])
  from (select ((p_day - date '1970-01-01') % 40) as i) x;
$$;
-- lineup:end

create or replace function our_misses_private.on_today(p_game text, t timestamptz)
returns boolean language sql stable set search_path = ''
as $$
  select case when p_game in ('prove', 'tot', 'hth', 'agak', 'doodle')
    then our_misses_private.lineup(our_misses_private.day_of(t)) ->> 'daily' = p_game
    else our_misses_private.lineup(our_misses_private.day_of(t)) -> 'play' ? p_game end;
$$;

-- Doodle Day ---------------------------------------------------------------------------------
-- A doodle is the strokes, not a picture: [{"c": colour 0-5, "w": width 1-3, "p": [x, y, x, y, …]}]
-- with coordinates 0-1000. Hidden from the other until you've both drawn.
create table our_misses_private.doodle (
  day date not null,
  player text not null check (player in ('Aleem', 'Nurul')),
  prompt text not null check (length(prompt) between 1 and 40),
  strokes jsonb not null check (jsonb_typeof(strokes) = 'array' and jsonb_array_length(strokes) between 1 and 400),
  drawn_at timestamptz not null,
  settled_at timestamptz,
  primary key (day, player)
);
alter table our_misses_private.doodle enable row level security;
revoke all on our_misses_private.doodle from public, anon, authenticated;

create function our_misses_private.doodle_day(p_day date, me text)
returns jsonb language sql stable set search_path = ''
as $$
  with rows as (select * from our_misses_private.doodle where day = p_day),
  shown as (select count(*) = 2 as revealed from rows)
  select jsonb_build_object(
    'day', p_day,
    'revealed', shown.revealed,
    'Aleem', (select case when r.player = me or shown.revealed
                then jsonb_build_object('prompt', r.prompt, 'strokes', r.strokes)
                else jsonb_build_object('drawn', true) end
              from rows r where r.player = 'Aleem'),
    'Nurul', (select case when r.player = me or shown.revealed
                then jsonb_build_object('prompt', r.prompt, 'strokes', r.strokes)
                else jsonb_build_object('drawn', true) end
              from rows r where r.player = 'Nurul')
  ) from shown;
$$;

create function public.our_misses_doodle_today()
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
    'today', our_misses_private.doodle_day(our_misses_private.day_of(t), me));
end;
$$;

-- When the second doodle arrives, it's +2 for each of you.
create function public.our_misses_doodle_submit(p_prompt text, p_strokes jsonb)
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
  if p_prompt is null or length(p_prompt) not between 1 and 40
     or p_strokes is null or jsonb_typeof(p_strokes) <> 'array'
     or jsonb_array_length(p_strokes) not between 1 and 400 or octet_length(p_strokes::text) > 60000 then
    raise exception 'draw something (but not too much)' using errcode = '22023';
  end if;
  if not our_misses_private.on_today('doodle', t) then
    raise exception 'Doodle Day is not on today' using errcode = 'P0001';
  end if;
  insert into our_misses_private.doodle (day, player, prompt, strokes, drawn_at)
  values (today, me, p_prompt, p_strokes, t)
  on conflict do nothing;
  if not found then
    raise exception 'already drew today' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('our_misses_doodle'));
  if (select count(*) from our_misses_private.doodle where day = today and settled_at is null) = 2 then
    insert into public.our_misses_events (player, kind, points, created_at)
    values ('Aleem', 'doodle', 2, t), ('Nurul', 'doodle', 2, t);
    update our_misses_private.doodle set settled_at = t where day = today;
  end if;
  return public.our_misses_doodle_today();
end;
$$;

create function public.our_misses_doodle_album(p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(our_misses_private.doodle_day(d.day, me) order by d.day desc)
    from (select day from our_misses_private.doodle group by day having count(*) = 2
          order by day desc limit least(greatest(coalesce(p_limit, 30), 1), 120)) d
  ), '[]'::jsonb);
end;
$$;

-- Marina Mini Golf, Chope Wars, Draw & Guess and In Sync join the VS games -------------------
alter table our_misses_private.duels drop constraint duels_game_check;
alter table our_misses_private.duels add constraint duels_game_check
  check (game in ('tug', 'pour', 'quiz', 'chapteh', 'mrt', 'kopi', 'sps', 'cannot', 'golf', 'chope', 'draw', 'sync'));

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
    when 'golf' then interval '180 seconds'
    when 'chope' then interval '300 seconds'
    when 'draw' then interval '90 seconds'
    when 'sync' then interval '30 seconds'
    else interval '15 seconds' end;
$$;

-- Chope Wars moves, in order. Whoever sent the challenge moves first (the other one started
-- the game by accepting), then you alternate. The phones replay these to know the board.
-- A 3 x 3 board has 24 stools.
create table our_misses_private.chope (
  duel_id bigint not null references our_misses_private.duels(id) on delete cascade,
  n smallint not null check (n between 1 and 60),
  player text not null check (player in ('Aleem', 'Nurul')),
  kind text not null check (kind in ('place', 'swap')),
  stool smallint not null check (stool between 0 and 23),
  moved_at timestamptz not null,
  primary key (duel_id, n)
);
alter table our_misses_private.chope enable row level security;
revoke all on our_misses_private.chope from public, anon, authenticated;

create function our_misses_private.chope_moves(p_id bigint)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('n', n, 'player', player, 'kind', kind, 'stool', stool) order by n), '[]'::jsonb)
  from our_misses_private.chope where duel_id = p_id;
$$;

create function public.our_misses_chope_move(p_id bigint, p_n int, p_kind text, p_stool int)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  d our_misses_private.duels%rowtype;
  moved int;
  first_mover text;
  mover text;
  owner text;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('place', 'swap') or p_stool is null or p_stool not between 0 and 23 then
    raise exception 'not a move' using errcode = '22023';
  end if;
  select * into d from our_misses_private.duels where id = p_id and game = 'chope' for update;
  if not found or d.settled_at is not null or t < d.starts_at or t > d.starts_at + interval '300 seconds' then
    raise exception 'no game to move in' using errcode = 'P0001';
  end if;
  select count(*) into moved from our_misses_private.chope where duel_id = p_id;
  first_mover := case when d.started_by = 'Aleem' then 'Nurul' else 'Aleem' end;
  -- (Worked out first: an IF condition can't hold a CASE, whose THEN would end the condition.)
  mover := case when p_n % 2 = 1 then first_mover else d.started_by end;
  if p_n <> moved + 1 or me <> mover then
    raise exception 'not your turn' using errcode = 'P0001';
  end if;
  if (select count(*) from our_misses_private.chope where duel_id = p_id and kind = 'place') >= 24 then
    raise exception 'the game is over' using errcode = 'P0001';
  end if;
  select c.player into owner from our_misses_private.chope c
  where c.duel_id = p_id and c.stool = p_stool order by c.n desc limit 1;
  if p_kind = 'place' and owner is not null then
    raise exception 'that stool is choped' using errcode = 'P0001';
  end if;
  if p_kind = 'swap' and (owner is null or owner = me
     or exists (select 1 from our_misses_private.chope where duel_id = p_id and player = me and kind = 'swap')) then
    raise exception 'the auntie can’t swap that' using errcode = 'P0001';
  end if;
  insert into our_misses_private.chope (duel_id, n, player, kind, stool, moved_at) values (p_id, p_n, me, p_kind, p_stool, t);
  return our_misses_private.chope_moves(p_id);
end;
$$;

create function public.our_misses_chope_get(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if our_misses_private.my_player() is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return our_misses_private.chope_moves(p_id);
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

  if d.game in ('chapteh', 'cannot', 'draw', 'sync') then
    -- Together: nobody wins. It counts only as far as both phones agree.
    together := least(a, n);
    ev_kind := case d.game when 'chapteh' then 'rally' else d.game end;
    update our_misses_private.duels set aleem_score = a, nurul_score = n, winner = 'tie', points = 0, settled_at = t
    where id = p_id;
    foreach p in array array['Aleem', 'Nurul'] loop
      select coalesce(sum(e.points), 0)::int into today from public.our_misses_events e
      where e.kind = ev_kind and e.player = p
        and our_misses_private.day_of(e.created_at) = our_misses_private.day_of(t);
      -- Chapteh: every 4 kicks is a miss. In Sync: every 4 beats you both hit.
      -- Cannot Say! and Draw & Guess: every word is. 6 a game, 12 a day.
      per_game := case when d.game in ('chapteh', 'sync') then together / 4 else together end;
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
  if p_game is null or p_game not in ('tug', 'pour', 'quiz', 'chapteh', 'mrt', 'kopi', 'sps', 'cannot', 'golf', 'chope', 'draw', 'sync') then
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
    if d.game in ('cannot', 'draw') and t < d.starts_at + interval '85 seconds' then
      raise exception 'the round is not over yet' using errcode = '22023';
    end if;
    if d.game = 'golf' and t < d.starts_at + interval '6 seconds' then
      raise exception 'the round is not over yet' using errcode = '22023';
    end if;
    -- Chope Wars is over once every stool is choped, or when time runs out.
    if d.game = 'chope' and t < d.starts_at + interval '300 seconds'
       and (select count(*) from our_misses_private.chope where duel_id = p_id and kind = 'place') < 24 then
      raise exception 'the game is not over yet' using errcode = '22023';
    end if;
    if d.game = 'sync' and t < d.starts_at + interval '24 seconds' then
      raise exception 'the song is not over yet' using errcode = '22023';
    end if;
    if d.game = 'pour' and coalesce(p_solved, false) and t < d.starts_at + interval '8 seconds' then
      raise exception 'too fast to be true' using errcode = '22023';
    end if;
    v := case
      when d.game = 'tug' then least(p_score, 300)
      when d.game in ('quiz', 'mrt') then least(p_score, 1540)
      when d.game = 'chapteh' then least(p_score, 500)
      when d.game = 'kopi' then least(p_score, 40)
      when d.game in ('cannot', 'draw') then least(p_score, 60)
      -- Golf is 40 minus your strokes (unfinished holes count as picked up), so more is better.
      when d.game = 'golf' then least(p_score, 37)
      -- Chope Wars: points × 10 + tables.
      when d.game = 'chope' then least(p_score, 200)
      when d.game = 'sync' then least(p_score, 24)
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

-- The history board gains Doodle Day, Draw & Guess and In Sync columns, and the best golf round.
drop function public.our_misses_weeks();
create function public.our_misses_weeks()
returns table (
  week_start date, aleem int, nurul int,
  aleem_misses int, nurul_misses int, same_brains int, longest_rally int,
  aleem_proven int, nurul_proven int, aleem_bluffs int, nurul_bluffs int,
  aleem_duels int, nurul_duels int,
  hands int, tot int, best_chapteh int,
  hth int, agak int, cannot int,
  doodle int, draw int, sync int, best_golf int
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
             coalesce(sum(e.points) filter (where e.kind = 'cannot'), 0)::int as cannot,
             coalesce(sum(e.points) filter (where e.kind = 'doodle'), 0)::int as doodle,
             coalesce(sum(e.points) filter (where e.kind = 'draw'), 0)::int as draw,
             coalesce(sum(e.points) filter (where e.kind = 'sync'), 0)::int as sync
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
             (max(least(x.aleem_score, x.nurul_score)) filter (where x.game = 'chapteh'))::int as best_chapteh,
             -- Fewest strokes either of you took over a golf round (0 = none played).
             coalesce(40 - (max(greatest(x.aleem_score, x.nurul_score))
               filter (where x.game = 'golf' and greatest(x.aleem_score, x.nurul_score) > 0)), 0)::int as best_golf
      from our_misses_private.duels x
      where x.game in ('chapteh', 'golf') and x.settled_at is not null
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
           coalesce(ev.hth, 0), coalesce(ev.agak, 0), coalesce(ev.cannot, 0),
           coalesce(ev.doodle, 0), coalesce(ev.draw, 0), coalesce(ev.sync, 0), coalesce(ch.best_golf, 0)
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

revoke all on function public.our_misses_doodle_today() from public, anon, authenticated;
revoke all on function public.our_misses_doodle_submit(text, jsonb) from public, anon, authenticated;
revoke all on function public.our_misses_doodle_album(int) from public, anon, authenticated;
revoke all on function public.our_misses_chope_move(bigint, int, text, int) from public, anon, authenticated;
revoke all on function public.our_misses_chope_get(bigint) from public, anon, authenticated;
revoke all on function public.our_misses_weeks() from public, anon, authenticated;
grant execute on function public.our_misses_doodle_today() to authenticated;
grant execute on function public.our_misses_doodle_submit(text, jsonb) to authenticated;
grant execute on function public.our_misses_doodle_album(int) to authenticated;
grant execute on function public.our_misses_chope_move(bigint, int, text, int) to authenticated;
grant execute on function public.our_misses_chope_get(bigint) to authenticated;
grant execute on function public.our_misses_weeks() to authenticated;

commit;
