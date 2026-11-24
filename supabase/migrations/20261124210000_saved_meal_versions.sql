-- Nicknames and versions for saved meals (issue 12).

-- A nickname belongs to the active version only; superseded versions keep
-- theirs as history without blocking it.
drop index public.saved_meals_user_nickname_key;
create unique index saved_meals_user_nickname_key
  on public.saved_meals (user_id, lower(nickname))
  where nickname is not null and archived = false and superseded_by is null;

-- "Update going forward" or "Re-estimate": the active saved meal gets a new
-- version with the new items. The old row is kept and points at the new one,
-- so logs that used it are unchanged. Returns the new version's id, or null
-- if p_id isn't the user's active meal. Security invoker: RLS applies.
create or replace function public.version_saved_meal(
  p_id uuid,
  p_items jsonb,
  p_calories numeric,
  p_protein_g numeric
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.saved_meals%rowtype;
  v_new uuid;
begin
  select * into v_old
  from public.saved_meals
  where id = p_id
    and user_id = (select auth.uid())
    and superseded_by is null
    and archived = false
  for update;

  if not found then
    return null;
  end if;

  -- Insert without the unique keys, retire the old version, then move them.
  insert into public.saved_meals
    (user_id, name, items, calories, protein_g, place_id,
     use_count, last_used_at, version)
  values
    (v_old.user_id, v_old.name, p_items, p_calories, p_protein_g, v_old.place_id,
     v_old.use_count + 1, now(), v_old.version + 1)
  returning id into v_new;

  update public.saved_meals set superseded_by = v_new where id = v_old.id;

  update public.saved_meals
  set match_key = v_old.match_key,
      nickname = v_old.nickname
  where id = v_new;

  return v_new;
end;
$$;

revoke all on function public.version_saved_meal(uuid, jsonb, numeric, numeric) from public, anon;
grant execute on function public.version_saved_meal(uuid, jsonb, numeric, numeric) to authenticated;
