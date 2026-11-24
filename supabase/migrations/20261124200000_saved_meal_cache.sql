-- Saved-meal cache (issue 11): every confirmed meal becomes a reusable
-- saved meal, matched by normalized text so a repeat line needs no AI call.

-- Normalized input text (see src/lib/meals/normalize.ts). Unique among the
-- user's active meals; superseded versions (issue 12) keep their key.
alter table public.saved_meals add column match_key text;

create unique index saved_meals_user_match_key_key
  on public.saved_meals (user_id, match_key)
  where match_key is not null and superseded_by is null and archived = false;

-- Records a confirmed meal: creates the saved meal, or bumps the active one
-- with the same key and replaces its items with the newly confirmed ones.
-- Security invoker: runs as the user, so RLS applies.
create or replace function public.record_saved_meal(
  p_match_key text,
  p_name text,
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
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select id into v_id
  from public.saved_meals
  where user_id = v_user
    and match_key = p_match_key
    and superseded_by is null
    and archived = false
  for update;

  if v_id is null then
    insert into public.saved_meals
      (user_id, name, match_key, items, calories, protein_g, use_count, last_used_at)
    values
      (v_user, p_name, p_match_key, p_items, p_calories, p_protein_g, 1, now())
    returning id into v_id;
  else
    update public.saved_meals
    set use_count = use_count + 1,
        last_used_at = now(),
        name = p_name,
        items = p_items,
        calories = p_calories,
        protein_g = p_protein_g
    where id = v_id;
  end if;

  return v_id;
end;
$$;

-- Re-logging a saved meal as is (cache hit or a tap on a recent meal).
-- Returns null if the meal isn't the user's or is no longer active.
create or replace function public.use_saved_meal(p_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  update public.saved_meals
  set use_count = use_count + 1,
      last_used_at = now()
  where id = p_id
    and user_id = (select auth.uid())
    and superseded_by is null
    and archived = false
  returning id;
$$;

revoke all on function public.record_saved_meal(text, text, jsonb, numeric, numeric) from public, anon;
revoke all on function public.use_saved_meal(uuid) from public, anon;
grant execute on function public.record_saved_meal(text, text, jsonb, numeric, numeric) to authenticated;
grant execute on function public.use_saved_meal(uuid) to authenticated;
