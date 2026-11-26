-- Phase 3: more ways to miss each other.
--   Why:          tag a miss with the reason it happened.
--   Hold hands:   both thumbs on the screen at once; +1 miss per 20 s together, 5 a day.
--   This or That: a daily "pick yours, guess theirs", revealed once both have answered.
--   Chapteh (together), Kiasu Quiz and Next Stop (versus) join the VS games.
--   Daily lineup: each Singapore day has one daily game (Prove It or This or That) and three
--   of the five play games, rotating on a 10-day cycle; only today's games can be started.
begin;

-- The daily lineup -------------------------------------------------------------------------
-- Mirrored in src/game/lineup.ts (a test compares the two). Edit both, keep the markers.
-- lineup:start
create function our_misses_private.lineup(p_day date)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'day', p_day,
    'daily', (array['prove', 'tot', 'prove', 'tot', 'prove', 'tot', 'prove', 'tot', 'prove', 'tot'])[x.i + 1],
    'play', (array[
      '["tug", "quiz", "chapteh"]'::jsonb,
      '["pour", "mrt", "chapteh"]'::jsonb,
      '["tug", "pour", "quiz"]'::jsonb,
      '["mrt", "chapteh", "tug"]'::jsonb,
      '["pour", "quiz", "mrt"]'::jsonb,
      '["tug", "chapteh", "pour"]'::jsonb,
      '["quiz", "mrt", "chapteh"]'::jsonb,
      '["tug", "pour", "mrt"]'::jsonb,
      '["quiz", "chapteh", "pour"]'::jsonb,
      '["tug", "mrt", "quiz"]'::jsonb
    ])[x.i + 1])
  from (select ((p_day - date '1970-01-01') % 10) as i) x;
$$;
-- lineup:end

-- Is this game on today? (prove / tot are the daily game; the rest are play games.)
create function our_misses_private.on_today(p_game text, t timestamptz)
returns boolean language sql stable set search_path = ''
as $$
  select case when p_game in ('prove', 'tot')
    then our_misses_private.lineup(our_misses_private.day_of(t)) ->> 'daily' = p_game
    else our_misses_private.lineup(our_misses_private.day_of(t)) -> 'play' ? p_game end;
$$;

create function public.our_misses_lineup()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  t timestamptz := our_misses_private.clock();
begin
  if not our_misses_private.is_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', our_misses_private.lineup(our_misses_private.day_of(t)),
    'tomorrow', our_misses_private.lineup(our_misses_private.day_of(t) + 1));
end;
$$;

-- Prove It only on its days (otherwise unchanged from phase 2).
create or replace function public.our_misses_prove_start(p_level int)
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
  if not our_misses_private.on_today('prove', t) then
    raise exception 'Prove It is not on today' using errcode = 'P0001';
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

-- New kinds of misses, and reasons on misses ----------------------------------------------
alter table public.our_misses_events add column reason smallint check (reason between 1 and 10);
alter table public.our_misses_events add constraint our_misses_reason_on_misses check (reason is null or kind = 'miss');
alter table public.our_misses_events drop constraint our_misses_events_kind_check;
alter table public.our_misses_events add constraint our_misses_events_kind_check
  check (kind in ('miss', 'same_brain', 'prove_it', 'duel', 'hands', 'tot', 'rally'));
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
  or (kind in ('hands', 'rally') and charge is null and rally_length is null and ref_id is null
    and rally_bonus = 0 and points between 1 and 6)
  or (kind = 'tot' and charge is null and rally_length is null and ref_id is null
    and rally_bonus = 0 and points between 1 and 3)
);

-- Why: tag your own miss within 10 minutes of sending it. The partner sees the update live.
create function public.our_misses_tag(p_id bigint, p_reason int)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  e public.our_misses_events%rowtype;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not between 1 and 10 then
    raise exception 'unknown reason' using errcode = '22023';
  end if;
  update public.our_misses_events set reason = p_reason
  where id = p_id and player = me and kind = 'miss' and reason is null
    and created_at > t - interval '10 minutes'
  returning * into e;
  if not found then
    raise exception 'that miss can no longer be tagged' using errcode = 'P0001';
  end if;
  return to_jsonb(e);
end;
$$;

-- All-time reason counts, for "why we miss each other".
create function public.our_misses_reasons()
returns table (player text, reason smallint, n int)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not our_misses_private.is_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return query
    select e.player, e.reason, count(*)::int from public.our_misses_events e
    where e.reason is not null group by 1, 2 order by 3 desc, 2;
end;
$$;

-- Hold hands: the phone reports seconds held together; 20 s = 1 miss, at most 5 a day each.
create function public.our_misses_hands(p_seconds int)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  today int;
  earned int;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_seconds is null or p_seconds not between 0 and 3600 then
    raise exception 'seconds must be 0 to 3600' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('our_misses_hands:' || me));
  select coalesce(sum(e.points), 0)::int into today from public.our_misses_events e
  where e.kind = 'hands' and e.player = me and our_misses_private.day_of(e.created_at) = our_misses_private.day_of(t);
  earned := greatest(0, least(p_seconds / 20, 5 - today));
  if earned > 0 then
    insert into public.our_misses_events (player, kind, points, created_at) values (me, 'hands', earned, t);
  end if;
  return jsonb_build_object('earned', earned, 'today', today + earned, 'cap', 5);
end;
$$;

-- This or That ------------------------------------------------------------------------------
create table our_misses_private.tot (
  day date not null,
  player text not null check (player in ('Aleem', 'Nurul')),
  question text not null check (length(question) between 1 and 40),
  mine smallint not null check (mine in (0, 1)),
  guess smallint not null check (guess in (0, 1)),
  answered_at timestamptz not null,
  settled_at timestamptz,
  primary key (day, player)
);
alter table our_misses_private.tot enable row level security;
revoke all on our_misses_private.tot from public, anon, authenticated;

-- One day's answers; the partner's stay hidden until you have both answered.
create function our_misses_private.tot_day(p_day date, me text)
returns jsonb language sql stable set search_path = ''
as $$
  with rows as (select * from our_misses_private.tot where day = p_day),
  shown as (select count(*) = 2 as revealed from rows)
  select jsonb_build_object(
    'day', p_day,
    'revealed', shown.revealed,
    'Aleem', (select case when r.player = me or shown.revealed
                then jsonb_build_object('question', r.question, 'mine', r.mine, 'guess', r.guess)
                else jsonb_build_object('answered', true) end
              from rows r where r.player = 'Aleem'),
    'Nurul', (select case when r.player = me or shown.revealed
                then jsonb_build_object('question', r.question, 'mine', r.mine, 'guess', r.guess)
                else jsonb_build_object('answered', true) end
              from rows r where r.player = 'Nurul')
  ) from shown;
$$;

create function public.our_misses_tot_today()
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
    'today', our_misses_private.tot_day(our_misses_private.day_of(t), me));
end;
$$;

-- Answer today's: your own pick, and your guess at theirs. When the second answer arrives,
-- a right guess is +2 and picking the same thing is +1, for each of you.
create function public.our_misses_tot_answer(p_question text, p_mine int, p_guess int)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  today date := our_misses_private.day_of(t);
  a our_misses_private.tot%rowtype;
  n our_misses_private.tot%rowtype;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_question is null or length(p_question) not between 1 and 40
     or p_mine is null or p_mine not in (0, 1) or p_guess is null or p_guess not in (0, 1) then
    raise exception 'answer with 0 or 1' using errcode = '22023';
  end if;
  if not our_misses_private.on_today('tot', t) then
    raise exception 'This or That is not on today' using errcode = 'P0001';
  end if;
  insert into our_misses_private.tot (day, player, question, mine, guess, answered_at)
  values (today, me, p_question, p_mine, p_guess, t)
  on conflict do nothing;
  if not found then
    raise exception 'already answered today' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('our_misses_tot'));
  select * into a from our_misses_private.tot where day = today and player = 'Aleem' and settled_at is null;
  select * into n from our_misses_private.tot where day = today and player = 'Nurul' and settled_at is null;
  if a.player is not null and n.player is not null then
    insert into public.our_misses_events (player, kind, points, created_at)
    select x.player, 'tot', x.pts, t from (values
      ('Aleem', (case when a.guess = n.mine then 2 else 0 end) + (case when a.mine = n.mine then 1 else 0 end)),
      ('Nurul', (case when n.guess = a.mine then 2 else 0 end) + (case when a.mine = n.mine then 1 else 0 end))
    ) as x(player, pts) where x.pts > 0;
    update our_misses_private.tot set settled_at = t where day = today;
  end if;
  return public.our_misses_tot_today();
end;
$$;

-- Every day you both answered, newest first: the album.
create function public.our_misses_tot_album(p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(our_misses_private.tot_day(d.day, me) order by d.day desc)
    from (select day from our_misses_private.tot group by day having count(*) = 2
          order by day desc limit least(greatest(coalesce(p_limit, 60), 1), 365)) d
  ), '[]'::jsonb);
end;
$$;

-- Kiasu Quiz and Next Stop (versus) and Chapteh (together) join the VS games---------------------------
-- quiz, mrt: the same 7 questions on both phones (SG trivia, or the MRT network); faster
--          right answers score more (max 1540).
-- chapteh: one rally kicked between the phones. Both report its length and the smaller of
--          the two counts: every 4 kicks is +1 miss for each of you (6 a rally, 12 a day).
alter table our_misses_private.duels drop constraint duels_game_check;
alter table our_misses_private.duels add constraint duels_game_check check (game in ('tug', 'pour', 'quiz', 'chapteh', 'mrt'));

create or replace function our_misses_private.vs_length(game text)
returns interval language sql immutable set search_path = ''
as $$
  select case game
    when 'pour' then interval '180 seconds'
    when 'quiz' then interval '110 seconds'
    when 'mrt' then interval '110 seconds'
    when 'chapteh' then interval '300 seconds'
    else interval '15 seconds' end;
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
  rally int;
  p text;
  today int;
  earned int;
begin
  select * into d from our_misses_private.duels where id = p_id and settled_at is null for update;
  if not found then return; end if;
  a := coalesce(d.aleem_score, 0);
  n := coalesce(d.nurul_score, 0);

  if d.game = 'chapteh' then
    -- Together: nobody wins. The rally counts only as far as both phones agree.
    rally := least(a, n);
    update our_misses_private.duels set aleem_score = a, nurul_score = n, winner = 'tie', points = 0, settled_at = t
    where id = p_id;
    foreach p in array array['Aleem', 'Nurul'] loop
      select coalesce(sum(e.points), 0)::int into today from public.our_misses_events e
      where e.kind = 'rally' and e.player = p and our_misses_private.day_of(e.created_at) = our_misses_private.day_of(t);
      earned := greatest(0, least(rally / 4, 6, 12 - today));
      if earned > 0 then
        insert into public.our_misses_events (player, kind, points, created_at) values (p, 'rally', earned, t);
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
  if p_game is null or p_game not in ('tug', 'pour', 'quiz', 'chapteh', 'mrt') then
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
    if d.game in ('quiz', 'mrt') and t < d.starts_at + interval '7 seconds' then
      raise exception 'the quiz is not over yet' using errcode = '22023';
    end if;
    if d.game = 'pour' and coalesce(p_solved, false) and t < d.starts_at + interval '8 seconds' then
      raise exception 'too fast to be true' using errcode = '22023';
    end if;
    v := case
      when d.game = 'tug' then least(p_score, 300)
      when d.game in ('quiz', 'mrt') then least(p_score, 1540)
      when d.game = 'chapteh' then least(p_score, 500)
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

-- The history board gains Hold hands, This or That and best-rally columns.
drop function public.our_misses_weeks();
create function public.our_misses_weeks()
returns table (
  week_start date, aleem int, nurul int,
  aleem_misses int, nurul_misses int, same_brains int, longest_rally int,
  aleem_proven int, nurul_proven int, aleem_bluffs int, nurul_bluffs int,
  aleem_duels int, nurul_duels int,
  hands int, tot int, best_chapteh int
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
             coalesce(sum(e.points) filter (where e.kind = 'tot'), 0)::int as tot
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
           coalesce(ev.hands, 0), coalesce(ev.tot, 0), coalesce(ch.best_chapteh, 0)
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

revoke all on function public.our_misses_lineup() from public, anon, authenticated;
revoke all on function public.our_misses_tag(bigint, int) from public, anon, authenticated;
revoke all on function public.our_misses_reasons() from public, anon, authenticated;
revoke all on function public.our_misses_hands(int) from public, anon, authenticated;
revoke all on function public.our_misses_tot_today() from public, anon, authenticated;
revoke all on function public.our_misses_tot_answer(text, int, int) from public, anon, authenticated;
revoke all on function public.our_misses_tot_album(int) from public, anon, authenticated;
revoke all on function public.our_misses_weeks() from public, anon, authenticated;
grant execute on function public.our_misses_lineup() to authenticated;
grant execute on function public.our_misses_tag(bigint, int) to authenticated;
grant execute on function public.our_misses_reasons() to authenticated;
grant execute on function public.our_misses_hands(int) to authenticated;
grant execute on function public.our_misses_tot_today() to authenticated;
grant execute on function public.our_misses_tot_answer(text, int, int) to authenticated;
grant execute on function public.our_misses_tot_album(int) to authenticated;
grant execute on function public.our_misses_weeks() to authenticated;

commit;
