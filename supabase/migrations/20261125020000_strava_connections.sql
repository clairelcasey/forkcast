-- Strava connect and sync (issue 15).
--
-- Token columns stay unreadable and unwritable for the authenticated role
-- (see the init migration). The server reaches them only through the
-- functions below, which run as definer but act on auth.uid()'s own row, so
-- no service-role key is needed. Tokens are stored encrypted with a key that
-- exists only on the server (TOKEN_ENCRYPTION_KEY), so even these functions
-- never hand out a usable token.

alter table public.strava_connections add column last_synced_at timestamptz;
grant select (last_synced_at) on public.strava_connections to authenticated;

-- Stores (or replaces) the caller's Strava connection.
create or replace function public.save_strava_connection(
  p_athlete_id bigint,
  p_refresh_token_encrypted text,
  p_access_token_encrypted text,
  p_expires_at timestamptz,
  p_scopes text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  insert into public.strava_connections
    (user_id, athlete_id, refresh_token_encrypted, access_token_encrypted,
     expires_at, scopes)
  values
    (v_user, p_athlete_id, p_refresh_token_encrypted, p_access_token_encrypted,
     p_expires_at, p_scopes)
  on conflict (user_id) do update
  set athlete_id = excluded.athlete_id,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      access_token_encrypted = excluded.access_token_encrypted,
      expires_at = excluded.expires_at,
      scopes = excluded.scopes;
end;
$$;

-- The caller's encrypted tokens, for the server to decrypt and use.
create or replace function public.strava_tokens()
returns table (
  athlete_id bigint,
  refresh_token_encrypted text,
  access_token_encrypted text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.athlete_id, c.refresh_token_encrypted, c.access_token_encrypted, c.expires_at
  from public.strava_connections c
  where c.user_id = (select auth.uid());
$$;

-- Records a finished sync for the caller.
create or replace function public.mark_strava_synced()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.strava_connections
  set last_synced_at = now()
  where user_id = (select auth.uid());
$$;

revoke all on function public.save_strava_connection(bigint, text, text, timestamptz, text[]) from public, anon;
revoke all on function public.strava_tokens() from public, anon;
revoke all on function public.mark_strava_synced() from public, anon;
grant execute on function public.save_strava_connection(bigint, text, text, timestamptz, text[]) to authenticated;
grant execute on function public.strava_tokens() to authenticated;
grant execute on function public.mark_strava_synced() to authenticated;
