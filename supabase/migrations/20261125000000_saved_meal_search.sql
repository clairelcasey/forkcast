-- Fuzzy saved-meal search (issue 13). pg_trgm instead of embeddings: free,
-- inside Postgres, under RLS. Handles typos and partial names.

create extension if not exists pg_trgm with schema extensions;

create index saved_meals_match_key_trgm
  on public.saved_meals using gin (match_key extensions.gin_trgm_ops)
  where superseded_by is null and archived = false;

-- The user's active saved meals that best match a partly typed line.
-- p_query should already be normalized (src/lib/meals/normalize.ts).
-- score: 1 for a prefix match, else trigram word similarity (0-1) against
-- the meal text or its nickname. Callers pick their own threshold.
create or replace function public.search_saved_meals(p_query text, p_limit integer default 5)
returns table (
  id uuid,
  name text,
  nickname text,
  items jsonb,
  calories numeric,
  protein_g numeric,
  use_count integer,
  last_used_at timestamptz,
  score real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.id, s.name, s.nickname, s.items, s.calories, s.protein_g,
    s.use_count, s.last_used_at,
    greatest(
      case
        when starts_with(s.match_key, p_query)
          or starts_with(lower(coalesce(s.nickname, '')), p_query)
        then 1
        else 0
      end,
      extensions.word_similarity(p_query, s.match_key),
      coalesce(extensions.word_similarity(p_query, lower(s.nickname)), 0)
    )::real as score
  from public.saved_meals s
  where s.user_id = (select auth.uid())
    and s.superseded_by is null
    and s.archived = false
    and s.match_key is not null
    and length(p_query) > 0
  order by score desc, s.use_count desc, s.last_used_at desc nulls last
  limit least(greatest(p_limit, 1), 10);
$$;

revoke all on function public.search_saved_meals(text, integer) from public, anon;
grant execute on function public.search_saved_meals(text, integer) to authenticated;
