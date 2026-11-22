-- our_misses: who misses more? One shared ledger of misses between two invited members.
-- The browser only asks to send a miss; every point is decided here. Access fails closed
-- until both members exist. Safe to add to a project that already hosts other apps:
-- every object is prefixed our_misses.
begin;

create schema if not exists our_misses_private;
revoke all on schema our_misses_private from public, anon, authenticated;
grant usage on schema our_misses_private to authenticated;

-- Members ---------------------------------------------------------------------------------
create table public.our_misses_members (
  player text primary key check (player in ('Aleem', 'Nurul')),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table public.our_misses_members enable row level security;
revoke all on public.our_misses_members from public, anon, authenticated;

create function our_misses_private.my_player()
returns text language sql stable security definer set search_path = ''
as $$
  select m.player from public.our_misses_members m
  where m.user_id = auth.uid()
    and (select count(*) from public.our_misses_members) = 2;
$$;

create function our_misses_private.is_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select our_misses_private.my_player() is not null; $$;

-- Replaced in the SQL test suite to move time; production always uses the transaction time.
create function our_misses_private.clock()
returns timestamptz language sql stable set search_path = ''
as $$ select now(); $$;

-- Seasons run Monday 00:00 to Sunday 23:59 in Singapore.
create function our_misses_private.week_of(t timestamptz)
returns date language sql immutable set search_path = ''
as $$ select date_trunc('week', t at time zone 'Asia/Singapore')::date; $$;

revoke all on all functions in schema our_misses_private from public, anon, authenticated;
grant execute on function our_misses_private.is_member() to authenticated;
grant execute on function our_misses_private.my_player() to authenticated;

grant select (player, user_id) on public.our_misses_members to authenticated;
create policy "members see the pair" on public.our_misses_members
  for select to authenticated using (our_misses_private.is_member());

-- Hearts: 3 stored at most, one back every 30 minutes ----------------------------------------
create table public.our_misses_hearts (
  player text primary key check (player in ('Aleem', 'Nurul')),
  stored smallint not null check (stored between 0 and 3),
  refilled_at timestamptz not null
);
alter table public.our_misses_hearts enable row level security;
revoke all on public.our_misses_hearts from public, anon, authenticated;
grant select (player, stored, refilled_at) on public.our_misses_hearts to authenticated;
create policy "members see both hearts" on public.our_misses_hearts
  for select to authenticated using (our_misses_private.is_member());
insert into public.our_misses_hearts (player, stored, refilled_at)
values ('Aleem', 3, now()), ('Nurul', 3, now());

-- Hearts available at time t, and when the next one arrives (null when full).
create function our_misses_private.hearts_at(stored smallint, refilled_at timestamptz, t timestamptz)
returns jsonb language sql stable set search_path = ''
as $$
  with r as (
    select greatest(0, floor(extract(epoch from (t - refilled_at)) / 1800))::int as regained
  )
  select jsonb_build_object(
    'hearts', least(3, stored + r.regained),
    'next_at', case when stored + r.regained >= 3 then null
                    else refilled_at + make_interval(mins => 30 * (r.regained + 1)) end
  ) from r;
$$;
revoke all on function our_misses_private.hearts_at(smallint, timestamptz, timestamptz) from public, anon, authenticated;

-- The ledger -------------------------------------------------------------------------------
-- miss:       charge 1-3 from holding the button, plus a rally bonus for answering quickly.
-- same_brain: +3 for each player when both sent a miss within 60 s without seeing the other's.
create table public.our_misses_events (
  id bigint generated always as identity primary key,
  player text not null check (player in ('Aleem', 'Nurul')),
  kind text not null check (kind in ('miss', 'same_brain')),
  charge smallint check (charge between 1 and 3),
  rally_length smallint check (rally_length between 1 and 10000),
  rally_bonus smallint not null default 0 check (rally_bonus between 0 and 5),
  points smallint not null check (points between 1 and 20),
  ref_id bigint references public.our_misses_events(id),
  created_at timestamptz not null,
  constraint our_misses_event_shape check (
    (kind = 'miss' and charge is not null and rally_length is not null and ref_id is null
      and points = charge + rally_bonus)
    or (kind = 'same_brain' and charge is null and rally_length is null and ref_id is not null
      and rally_bonus = 0 and points = 3)
  )
);
create index our_misses_events_created_at on public.our_misses_events (created_at);
create unique index our_misses_one_pair_per_miss on public.our_misses_events (ref_id)
  where kind = 'same_brain';
alter table public.our_misses_events enable row level security;
revoke all on public.our_misses_events from public, anon, authenticated;
grant select on public.our_misses_events to authenticated;
create policy "members read the ledger" on public.our_misses_events
  for select to authenticated using (our_misses_private.is_member());

-- RPC: what the app needs on open ---------------------------------------------------------
create function public.our_misses_status()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'me', me,
    'now', t,
    'week_start', our_misses_private.week_of(t),
    'hearts', (select jsonb_object_agg(h.player, our_misses_private.hearts_at(h.stored, h.refilled_at, t))
               from public.our_misses_hearts h)
  );
end;
$$;

-- RPC: send one miss. p_charge 1-3; p_seen_id is the newest partner event the sender had
-- already seen when they started holding (used to tell a Same Brain from a reply).
create function public.our_misses_send(p_charge int, p_seen_id bigint default 0)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := our_misses_private.my_player();
  t timestamptz := our_misses_private.clock();
  mine public.our_misses_hearts%rowtype;
  regained int;
  available int;
  last_miss public.our_misses_events%rowtype;
  partner_miss public.our_misses_events%rowtype;
  v_rally int := 1;
  v_bonus int := 0;
  new_miss public.our_misses_events%rowtype;
  created jsonb;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_charge is null or p_charge not between 1 and 3 then
    raise exception 'charge must be 1, 2 or 3' using errcode = '22023';
  end if;

  -- One send at a time for the pair: lock both heart rows in a fixed order.
  perform 1 from public.our_misses_hearts order by player for update;
  select * into mine from public.our_misses_hearts where player = me;

  regained := greatest(0, floor(extract(epoch from (t - mine.refilled_at)) / 1800))::int;
  available := least(3, mine.stored + regained);
  if available < 1 then
    raise exception 'no hearts left'
      using errcode = 'P0001',
            hint = (mine.refilled_at + make_interval(mins => 30 * (regained + 1)))::text;
  end if;
  update public.our_misses_hearts set
    stored = available - 1,
    refilled_at = case when available = 3 then t
                       else mine.refilled_at + make_interval(mins => 30 * regained) end
  where player = me;

  -- Rally: answering the partner's miss within 5 minutes grows the rally; each answer is
  -- worth one more point than the last (capped at +5). Sending twice in a row keeps it alive.
  select * into last_miss from public.our_misses_events
  where kind = 'miss' order by id desc limit 1;
  if found and last_miss.created_at > t - interval '5 minutes' then
    if last_miss.player <> me then
      v_rally := last_miss.rally_length + 1;
      v_bonus := least(5, v_rally - 1);
    else
      v_rally := last_miss.rally_length;
    end if;
  end if;

  insert into public.our_misses_events (player, kind, charge, rally_length, rally_bonus, points, created_at)
  values (me, 'miss', p_charge, v_rally, v_bonus, p_charge + v_bonus, t)
  returning * into new_miss;
  created := jsonb_build_array(to_jsonb(new_miss));

  -- Same Brain: the partner sent a miss in the last 60 s that this sender had not seen yet.
  select e.* into partner_miss from public.our_misses_events e
  where e.kind = 'miss' and e.player <> me
    and e.created_at > t - interval '60 seconds'
    and e.id > coalesce(p_seen_id, 0)
    and not exists (select 1 from public.our_misses_events s
                    where s.kind = 'same_brain' and s.ref_id = e.id)
  order by e.id desc limit 1;
  if found then
    with pair as (
      insert into public.our_misses_events (player, kind, points, ref_id, created_at)
      values (me, 'same_brain', 3, new_miss.id, t),
             (partner_miss.player, 'same_brain', 3, partner_miss.id, t)
      returning *
    )
    select created || coalesce(jsonb_agg(to_jsonb(pair) order by pair.id), '[]'::jsonb)
      into created from pair;
  end if;

  return jsonb_build_object(
    'events', created,
    'hearts', (select our_misses_private.hearts_at(h.stored, h.refilled_at, t)
               from public.our_misses_hearts h where h.player = me),
    'now', t
  );
end;
$$;

-- RPC: the history board. One row per season, newest first, rebuilt from the ledger (which
-- is never trimmed), so past weeks can always be looked back on exactly as they were played.
create function public.our_misses_weeks()
returns table (
  week_start date, aleem int, nurul int,
  aleem_misses int, nurul_misses int, same_brains int, longest_rally int
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not our_misses_private.is_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return query
    select our_misses_private.week_of(e.created_at) as week_start,
           coalesce(sum(e.points) filter (where e.player = 'Aleem'), 0)::int,
           coalesce(sum(e.points) filter (where e.player = 'Nurul'), 0)::int,
           (count(*) filter (where e.kind = 'miss' and e.player = 'Aleem'))::int,
           (count(*) filter (where e.kind = 'miss' and e.player = 'Nurul'))::int,
           (count(*) filter (where e.kind = 'same_brain') / 2)::int,
           coalesce(max(e.rally_length), 0)::int
    from public.our_misses_events e
    group by 1 order by 1 desc;
end;
$$;

revoke all on function public.our_misses_status() from public, anon, authenticated;
revoke all on function public.our_misses_send(int, bigint) from public, anon, authenticated;
revoke all on function public.our_misses_weeks() from public, anon, authenticated;
grant execute on function public.our_misses_status() to authenticated;
grant execute on function public.our_misses_send(int, bigint) to authenticated;
grant execute on function public.our_misses_weeks() to authenticated;

-- Live updates and the "is here" dot ------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.our_misses_events;
  end if;
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy "our_misses members read the room" on realtime.messages
        for select to authenticated
        using (realtime.topic() = 'our_misses:room' and our_misses_private.is_member())
    $p$;
    execute $p$
      create policy "our_misses members join the room" on realtime.messages
        for insert to authenticated
        with check (realtime.topic() = 'our_misses:room' and our_misses_private.is_member())
    $p$;
  end if;
end;
$$;

commit;
