# Forkcast

A personal AI nutrition tracker: a Next.js web app installed on an iPhone home
screen. Type one line ("salmon bowl, half the rice, iced latte") and get a
logged meal; protein and calorie targets follow the day's training.

The full product spec is [`docs/spec.md`](docs/spec.md). Conventions for
contributors (and Claude Code) are in [`CLAUDE.md`](CLAUDE.md).

## Status

Milestone 1 (Foundation): Next.js PWA, Supabase email-code sign-in with an
allowlist, per-user tables with row-level security, CI with gitleaks, Sentry.

## Stack

Next.js (App Router, TypeScript) on Vercel · Tailwind + shadcn/ui · Supabase
(Auth, Postgres + pgvector, RLS) · Claude API (server-side only) · Sentry.

## Local development

Requires Node 22+ and pnpm (`corepack enable`).

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase URL + publishable key
pnpm dev
```

Database migrations live in `supabase/migrations/`. With Docker running you can
use a local Supabase stack:

```bash
pnpm exec supabase start        # local Postgres, Auth, and an email inbox at :54324
pnpm exec supabase db reset     # apply migrations
```

Add your email to the allowlist before signing in:

```sql
insert into public.allowed_users (email) values ('you@example.com');
```

## Checks

```bash
pnpm typecheck && pnpm lint
```

CI also runs a production build and a gitleaks secret scan on every pull request.
