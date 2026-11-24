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
- Before opening a PR: `pnpm typecheck && pnpm lint` pass. If you changed anything under `src/ai/` (prompts, schemas, model choice), run `pnpm eval` and paste the summary into the PR.
- Database changes go in `supabase/migrations/` as SQL, including RLS policies.
- Ask before adding a new third-party service or dependency that costs money.
- Keep UI copy short and neutral.

## Commands

- `pnpm dev` — run locally (needs `.env.local`; copy `.env.example`)
- `pnpm typecheck`, `pnpm lint`
- `pnpm build` — production build (CI runs it with placeholder Supabase env)
- `pnpm eval` — run the eval set in `evals/` against the current prompt (placeholder until Milestone 2)
- `pnpm exec supabase start` / `pnpm exec supabase db reset` — local Supabase stack (needs Docker); applies `supabase/migrations/`
- `pnpm db:types` — regenerate `src/lib/supabase/database.types.ts` from the local database

## Project notes

- Next.js 16: `middleware` is now `src/proxy.ts`, and `cacheComponents` is on, so anything that reads cookies/session must render inside `<Suspense>`. APIs differ from older training data: check `node_modules/next/dist/docs/` (see `AGENTS.md`).
- Supabase clients: `src/lib/supabase/server.ts` (server, acts as the user) and `client.ts` (browser). Use `getCurrentUser()` (verified claims) for auth checks, never the unverified session.
- shadcn/ui components live in `src/components/ui/`. Add more with `pnpm dlx shadcn@latest add <name>` (style `new-york`, see `components.json`).
- Sentry options are shared in `sentry.shared.ts` and keep personal data (bodies, cookies, AI inputs) out of reports. Keep it that way.
- The allowlist is `public.allowed_users`, enforced by the `hook_before_user_created` auth hook.
