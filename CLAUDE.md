# Forkcast

Personal AI nutrition tracker: a Next.js PWA installed on an iPhone home screen. One user today (allowlisted), built multi-user. The full product spec is `docs/spec.md` — read the relevant section before starting any task.

## Stack

- Next.js (App Router, TypeScript strict) on Vercel, installable as a PWA
- Tailwind + shadcn/ui, mobile-first (design for a 390px-wide iPhone screen)
- Supabase: Auth (email + password, allowlist hook), Postgres + pgvector, row-level security
- Claude API (small, fast model) called only from server routes
- USDA FoodData Central + Nutritionix/FatSecret for nutrition; Google Places; Strava API
- Package manager: pnpm

## Hard rules

1. **No secrets in code.** All keys come from environment variables; update `.env.example` (names only) when adding one. The repo is public.
2. **Every table has `user_id` and RLS policies.** Never query without the user's session; never use the service-role key in code that handles a user request unless strictly needed, and say why.
3. **Strava data never goes into an LLM prompt.** Day-type classification is plain, tested code.
4. **API keys and AI calls stay server-side.** The client calls Next.js server routes only.
5. **Claude never invents nutrition numbers.** It picks from nutrition-database search results and estimates portions; validate its output with a Zod schema, retry once, then fall back to manual entry.
6. **Log every Claude call** to `ai_calls` (purpose, model, tokens, cost, latency, cache hit/miss, error).
7. **Guardrails are not optional:** calorie floor, no deficit on long-run days, no red numbers or guilt wording in the UI.
8. **Seed and demo data are fake.** Never commit real meals, weights or personal data.

## Workflow

- Work from one GitHub Issue at a time (`gh issue view <n>`). Branch `issue-<n>-short-name`, small PRs, link the issue in the PR body.
- Before opening a PR: `pnpm typecheck && pnpm lint && pnpm test` pass. If you changed anything under `src/ai/` (prompts, schemas, model choice), run `pnpm eval` and paste the summary into the PR.
- Database changes go in `supabase/migrations/` as SQL, including RLS policies.
- Ask before adding a new third-party service or dependency that costs money.
- Keep UI copy short and neutral.

## Commands

- `pnpm dev` — run locally (needs `.env.local`; copy `.env.example`)
- `pnpm typecheck`, `pnpm lint`
- `pnpm test` — unit tests (Vitest; files named `*.test.ts` next to the code)
- `pnpm build` — production build (CI runs it with placeholder Supabase env)
- `pnpm eval [--parser stub|claude] [--only id,id]` — run every case in `evals/cases/` through a meal parser; prints metrics and writes `evals/results/latest.md` for the PR. `--parser claude` calls the real API (needs `ANTHROPIC_API_KEY` and `USDA_API_KEY`) and costs money; the stub only checks the harness
- `pnpm exec supabase start` / `pnpm exec supabase db reset` — local Supabase stack (needs Docker); applies `supabase/migrations/`
- `pnpm db:types` — regenerate `src/lib/supabase/database.types.ts` from the local database

## Project notes

- Next.js 16: `middleware` is now `src/proxy.ts`, and `cacheComponents` is on, so anything that reads cookies/session must render inside `<Suspense>`. APIs differ from older training data: check `node_modules/next/dist/docs/` (see `AGENTS.md`).
- Supabase clients: `src/lib/supabase/server.ts` (server, acts as the user) and `client.ts` (browser). Use `getCurrentUser()` (verified claims) for auth checks, never the unverified session.
- shadcn/ui components live in `src/components/ui/`. Add more with `pnpm dlx shadcn@latest add <name>` (style `new-york`, see `components.json`).
- Sentry options are shared in `sentry.shared.ts` and keep personal data (bodies, cookies, AI inputs) out of reports. Keep it that way.
- **After every migration**, run `pnpm exec supabase db reset` then `pnpm db:types`, and commit the regenerated `database.types.ts` with the migration. Both Supabase clients are typed with it, so a stale file hides schema mistakes.
- Plain-code logic (day types, targets, guardrails) gets unit tests.
- Eval cases (`evals/cases/<id>.json`, schema in `evals/schema.ts`) use only public chain/packaged nutrition or made-up home meals. Totals must equal the sum of items. Set `checked_on` only after checking the numbers against the source.
- Offline: `public/sw.js` caches the app shell and the last home page (production only; cleared on sign-out). Meals saved offline wait in IndexedDB (`src/lib/offline/queue.ts`) and sync through `saveMealLog`; `client_id` makes retries safe. The server stays the source of truth.
- Meal parsing (`src/ai/claude-parser.ts`): Claude splits the line into search queries, code searches USDA (`src/server/nutrition/`), Claude picks a candidate id and an amount, code computes the numbers. Prompts in `src/ai/prompts.ts` stay static so they cache; model and prices in `src/ai/models.ts`.
- Saved meals (`src/server/saved-meals.ts`): matched by nickname, then by normalized text (`mealMatchKey`), before any AI call. Modifiers ("usual bowl, no rice") are plain code in `src/lib/meals/modifiers.ts`. Changing a saved meal makes a new version (`version_saved_meal`); old versions stay for the logs that used them.
- Suggestions: fuzzy matching is Postgres `pg_trgm` (`search_saved_meals`), not embeddings (a local model is over Vercel's function size limit; Anthropic has no embeddings API). Type-ahead shows matches ≥ 0.4, "Same as …?" asks at ≥ 0.6. "Log again" chips are ranked by time of day, weekday, recency and frequency (`src/lib/meals/suggest.ts`).
- Strava (`src/server/strava/`): OAuth via `/api/strava/connect` and `/callback` (state cookie). Tokens are AES-256-GCM encrypted with `TOKEN_ENCRYPTION_KEY` and reach the DB only through `save_strava_connection` / `strava_tokens` (security definer, the caller's own row); the token columns stay unreadable to the client. No service role. Activities map to workouts in plain code (`src/lib/strava/map.ts`); never send Strava data to an LLM.
- The allowlist is `public.allowed_users`, enforced by the `hook_before_user_created` auth hook.
