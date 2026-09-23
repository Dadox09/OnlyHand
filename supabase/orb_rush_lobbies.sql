-- Apply once in the production Supabase SQL editor before deploying online Orb Rush.
create table if not exists public.orb_rush_lobbies (
  code text primary key check (code ~ '^[A-F0-9]{10}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  check (guest_id is distinct from host_id)
);

create index if not exists orb_rush_lobbies_host on public.orb_rush_lobbies(host_id);
alter table public.orb_rush_lobbies enable row level security;
drop policy if exists "orb rush players read own lobby" on public.orb_rush_lobbies;
create policy "orb rush players read own lobby" on public.orb_rush_lobbies
  for select to authenticated
  using (expires_at > now() and (host_id = (select auth.uid()) or guest_id = (select auth.uid())));
revoke all on public.orb_rush_lobbies from public, anon, authenticated;
grant select on public.orb_rush_lobbies to authenticated;

create or replace function public.create_orb_rush_lobby()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare lobby public.orb_rush_lobbies;
begin
  if auth.uid() is null then raise exception 'Sign in to create a lobby'; end if;
  delete from public.orb_rush_lobbies where expires_at <= now();
  loop
    begin
      insert into public.orb_rush_lobbies(code, host_id)
      values (upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), auth.uid())
      returning * into lobby;
      return to_jsonb(lobby);
    exception when unique_violation then
      -- Extremely unlikely code collision; generate another one.
    end;
  end loop;
end;
$$;

create or replace function public.join_orb_rush_lobby(invite_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare lobby public.orb_rush_lobbies;
begin
  if auth.uid() is null or invite_code !~ '^[A-F0-9]{10}$' then
    raise exception 'Invalid lobby code';
  end if;
  select * into lobby from public.orb_rush_lobbies
  where code = invite_code and host_id = auth.uid() and expires_at > now();
  if found then return to_jsonb(lobby); end if;
  update public.orb_rush_lobbies
  set guest_id = auth.uid()
  where code = invite_code and expires_at > now()
    and host_id <> auth.uid()
    and (guest_id is null or guest_id = auth.uid())
  returning * into lobby;
  if not found then raise exception 'Lobby unavailable or full'; end if;
  return to_jsonb(lobby);
end;
$$;

create or replace function public.leave_orb_rush_lobby(invite_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.orb_rush_lobbies where code = invite_code and host_id = auth.uid();
  if not found then
    update public.orb_rush_lobbies set guest_id = null
    where code = invite_code and guest_id = auth.uid();
  end if;
end;
$$;

revoke execute on function public.create_orb_rush_lobby(), public.join_orb_rush_lobby(text),
  public.leave_orb_rush_lobby(text) from public, anon;
grant execute on function public.create_orb_rush_lobby(), public.join_orb_rush_lobby(text),
  public.leave_orb_rush_lobby(text) to authenticated;

-- Private Realtime Broadcast + Presence. Membership is checked when a client
-- subscribes; the code alone cannot open a channel without joining the lobby.
drop policy if exists "orb rush players receive realtime" on realtime.messages;
create policy "orb rush players receive realtime" on realtime.messages
  for select to authenticated using (
    extension in ('broadcast', 'presence') and exists (
      select 1 from public.orb_rush_lobbies l
      where ('orb-rush:' || l.code) = (select realtime.topic())
        and l.expires_at > now()
        and (l.host_id = (select auth.uid()) or l.guest_id = (select auth.uid()))
    )
  );
drop policy if exists "orb rush players send realtime" on realtime.messages;
create policy "orb rush players send realtime" on realtime.messages
  for insert to authenticated with check (
    extension in ('broadcast', 'presence') and exists (
      select 1 from public.orb_rush_lobbies l
      where ('orb-rush:' || l.code) = (select realtime.topic())
        and l.expires_at > now()
        and (l.host_id = (select auth.uid()) or l.guest_id = (select auth.uid()))
    )
  );

-- Expired rooms are removed hourly, including rooms abandoned by a closed tab.
select cron.schedule('onlyhand-orb-rush-lobbies', '15 * * * *',
  $$delete from public.orb_rush_lobbies where expires_at <= now()$$);

