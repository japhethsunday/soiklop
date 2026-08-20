# Deployment

Soiklop runs across three platforms, because no single one of them fits the
whole system.

| Component | Platform | Why |
|---|---|---|
| Database | Supabase (Postgres 17) | Managed Postgres, free tier |
| Frontend (Next.js) | Vercel | CDN, preview deployments |
| Backend (NestJS) | Render | Needs a long-running HTTP process |
| Orchestrator (Temporal worker) | Render | Needs a persistent worker process |
| Redis | Render | Needs a persistent service |
| Temporal server | Render | Needs gRPC on the private network |

The backend stack moved off Railway because Railway's plan capped the project
at four services and the fifth, the Temporal server, is the one that makes
scheduled publishing work at all. `render.yaml` in the repository root declares
the whole stack; see "Migrating to Render" below.

## Why the backend is not on Vercel

Vercel's serverless model cannot host this backend, and deploying it there
anyway would fail silently rather than loudly:

- `apps/backend` calls `app.listen()` and expects a long-running process.
- `apps/orchestrator` is a **Temporal worker**. It must stay resident to poll
  the task queue; every scheduled publish runs through it. On a serverless
  platform it would never run, so scheduled posts would sit in the queue
  forever while the UI showed them as scheduled.
- Redis and the Temporal server are stateful services with no serverless
  equivalent.

The frontend, by contrast, is an ordinary Next.js app and belongs on Vercel.

## Live resources

| Resource | Value |
|---|---|
| Frontend | https://soiklop-japheth-sunday.vercel.app |
| Backend API | https://backend-production-28cf.up.railway.app |
| Supabase project ref | `bevoflswidqbuxfehzpi` (region `eu-west-1`) |
| Supabase API URL | https://bevoflswidqbuxfehzpi.supabase.co |

## Same-origin API proxy (do not remove)

The frontend calls the backend at `/api/*` on its own origin, and
`next.config.js` rewrites that to the Railway backend under `beforeFiles`.
Three things make this necessary, and each one broke login on its own:

1. **Cookie domain.** `getCookieUrlFromDomain` resolves the cookie `Domain`
   from `FRONTEND_URL`. A backend on `railway.app` cannot set a cookie for a
   `vercel.app` host at all, so the auth cookie was dropped silently. Serving
   the API from the frontend's own origin removes the cross-site hop.
2. **Public suffix.** `vercel.app` is a public-suffix entry, and browsers
   refuse cookies scoped to one. `libraries/helpers/src/subdomain/subdomain.management.ts`
   now parses with `allowPrivateDomains`, yielding `.soiklop-japheth-sunday.vercel.app`.
   Ordinary domains are unchanged.
3. **Middleware matcher.** `apps/frontend/src/proxy.ts` matches
   `/((?!api/|_next/|_static/|_vercel|[\w-]+\.\w+).*)`. Any prefix other than
   `api/` is intercepted by the auth middleware and redirected to `/auth`, so
   the proxy must live under `/api`.

Rewrites declared in `vercel.json` do **not** apply to a Next.js app's own
routing — they must be in `next.config.js`. `vercel.json` only supplies
`BACKEND_PROXY_URL` and `NEXT_PUBLIC_BACKEND_URL` at build time.

## Temporal

`TemporalRegister.onModuleInit` no longer aborts startup when Temporal is
unreachable; it logs and continues. Without a Temporal service the API,
authentication, dashboard and analytics all work, but **scheduling and
publishing will fail** — loudly, at the point of use, never silently.

On Railway this was unfixable: the plan capped the project at four services and
the Temporal server would have been the fifth. `render.yaml` provisions it as a
private service, which is also the correct shape for it -- workers reach it over
gRPC on port 7233, which is not HTTP, and nothing outside the private network
should be able to reach it at all.

## Migrating to Render

`render.yaml` in the repository root declares the backend, the orchestrator,
the Temporal server, Temporal's database and Redis. Everything is code except
the secrets, which are marked `sync: false` so Render prompts for them and
stores them encrypted rather than having them committed.

Everything is placed in **frankfurt**, the Render region closest to the
Supabase project in `eu-west-1`. The previous deployment ran in `us-west2`,
which put a transatlantic round trip in front of every query.

### What it costs

Render has no free tier for private services, workers, or Postgres beyond a
30-day trial, so activating this Blueprint starts a paid subscription. The
plans are chosen from measured usage, not guessed:

| Resource | Plan | Why |
|---|---|---|
| `soiklop-backend` | standard | Measured 0.60GB steady and 1.45GB peak over 24h on the previous host. A 512MB instance is killed under ordinary load. |
| `soiklop-orchestrator` | starter | Measured 0.45GB peak -- but only ever idle, having never had a Temporal server to take work from. Raise to standard if it restarts once posts start publishing. |
| `soiklop-temporal` | standard | Four Temporal services run inside the one auto-setup container. |
| `soiklop-temporal-db` | basic-256mb | Cluster state only, not application data. |
| `soiklop-redis` | free | 25MB is ample for cache and pub/sub here. |

To trade reliability for cost, lower `plan:` on the backend first and watch for
out-of-memory restarts. Do not lower `soiklop-temporal-db` below a paid plan:
free Postgres expires after 30 days, and losing it destroys every scheduled
workflow.

### Steps

1. Render Dashboard -> **New** -> **Blueprint** -> select this repository. It
   reads `render.yaml` and shows what it will create.
2. Supply the two prompted secrets. Both must be **copied from the current
   Railway backend service** rather than invented:
   - `DATABASE_URL` -- the Supabase connection string.
   - `JWT_SECRET` -- changing this value invalidates every existing session,
     signing out every user.
3. Wait for `soiklop-temporal` to become live before judging the others. On
   first boot it applies the Temporal schema to an empty database; the backend
   and orchestrator log connection errors until it is up, which is expected and
   not a fault in them.
4. Confirm the backend is healthy: `GET https://soiklop-backend.onrender.com/monitor/queue/health`
   returns HTTP 200.
5. **Cut the frontend over.** In `apps/frontend/vercel.json`, change
   `BACKEND_PROXY_URL` and `BACKEND_INTERNAL_URL` from the Railway hostname to
   `https://soiklop-backend.onrender.com`, then push. This is the switch: until
   it happens the frontend still talks to Railway, so do it only once step 4
   passes. Keeping both stacks running through the cutover means a failure at
   this point is a one-line revert rather than an outage.
6. Verify a real scheduled post publishes end to end -- this is the thing the
   whole migration exists to enable, and it has never yet been exercised.
7. Only then delete the Railway project.

### Temporal on managed Postgres

Two details in `render.yaml` are not the defaults and both are load-bearing.

Render provisions exactly one database per instance and its role cannot
`CREATE DATABASE`. `temporalio/auto-setup` normally creates `temporal` and
`temporal_visibility` itself, which would fail. Instead `DBNAME` and
`VISIBILITY_DBNAME` both point at the single provisioned database and
`SKIP_DB_CREATE=true` stops the attempt; the two schemas share one database,
which is safe because their table names do not overlap.

`NUM_HISTORY_SHARDS` is fixed permanently when the cluster is first created.
Changing it later requires a new cluster, so it cannot be tuned in response to
load.

## Vercel framework preset (do not remove)

`apps/frontend/vercel.json` pins `"framework": "nextjs"`. This is load-bearing.

Vercel did **not** auto-detect the framework for this project. Without the
preset it ran a generic `pnpm run build` and then looked for a static output
directory; `next build` writes to `apps/frontend/.next`, which was never
served. The build reported success while serving nothing, so every route
returned a platform-level 404 — a failure mode that looks like a broken app
rather than a broken deploy config.

Symptoms if this regresses: `x-vercel-error: NOT_FOUND` on every path
including `/`, an 84-byte plain-text body, and no `lambdaRuntimeStats` on the
deployment.

## Database

The Prisma schema was applied to Supabase as four ordered migrations
(`postiz_01_enums` … `postiz_04_foreign_keys`), then verified against the
catalog: 48 tables, 11 enums, 127 explicit indexes and 57 foreign keys — an
exact match for `schema.prisma`.

### PostgREST lockdown (important)

Supabase exposes the whole `public` schema over HTTPS to the `anon` role using
the publishable key, which is public by design. Postiz does not use PostgREST —
it connects with Prisma over a direct Postgres connection as the table owner —
so that exposure is pure attack surface. Left open it would have served user
password hashes, **social OAuth access tokens** and OAuth client secrets to
anyone holding the publishable key.

The `lock_down_postgrest_exposure` migration closes it with two independent
layers:

1. RLS enabled on all 48 tables with **no policies**, which denies every
   non-owner role. Prisma is unaffected: table owners bypass RLS.
2. All privileges revoked from `anon` and `authenticated`, including default
   privileges so future tables inherit the restriction.

Supabase's security advisor reports zero ERROR-level findings after this. The
remaining INFO-level "RLS enabled, no policy" notices are the intended state,
not an oversight — there are no policies *because* no policy should ever grant
API access to these tables.

**If you later add Supabase Auth or client-side Supabase access**, do not
simply add permissive policies. Re-grant deliberately, table by table.

## Required configuration

### Still to be set

These could not be set automatically and the deployment will not be functional
until they are:

| Where | Variable | How to get it |
|---|---|---|
| Railway (shared) | `DATABASE_URL` | Supabase → Project Settings → Database. The project was created without a stored password, so reset the database password and use the pooler connection string. |
| Vercel | `NEXT_PUBLIC_BACKEND_URL` | `https://backend-production-28cf.up.railway.app` |
| Vercel | `NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY` | Only if serving uploads locally |

`DATABASE_URL` format (session pooler, port 5432 — Prisma needs session mode,
not transaction mode on 6543):

```
postgresql://postgres.bevoflswidqbuxfehzpi:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

### Already set on Railway

`NODE_ENV`, `JWT_SECRET` (generated, 48 random bytes), `REDIS_URL`,
`BACKEND_INTERNAL_URL`, `NEXT_PUBLIC_BACKEND_URL`, `FRONTEND_URL`,
`STORAGE_PROVIDER`, `IS_GENERAL`, `API_LIMIT`, `TEMPORAL_ADDRESS`,
`ORCHESTRATOR_PORT`.

No secret is committed to this repository. The repository is **public** —
keep it that way only if you are comfortable with the AGPL source-offer
obligation, and never commit a `.env`.

### Optional

Social platform OAuth credentials and AI provider keys are documented in
`.env.example`. Every platform integration stays inert until its credentials
are supplied.

## Connecting social channels

**No channel can connect until its credentials are configured.** This is not a
bug: every platform requires you to register a developer application and issue
your own OAuth keys. Nothing is currently set, which is why every channel
fails.

Set these on the **backend** service in Railway.

| Platform | Variables |
|---|---|
| Bluesky | *(none — see below)* |
| X | `X_API_KEY`, `X_API_SECRET` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| Facebook / Instagram | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |
| Threads | `THREADS_APP_ID`, `THREADS_APP_SECRET` |
| TikTok | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET` |
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` |
| Pinterest | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` |
| Discord | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN_ID` |
| Telegram | `TELEGRAM_TOKEN` |
| Mastodon | `MASTODON_URL`, `MASTODON_CLIENT_ID`, `MASTODON_CLIENT_SECRET` |

### Redirect URI

Every OAuth app must register this callback, substituting the provider's
identifier (`x`, `linkedin`, `facebook`, …):

```
https://soiklop.vercel.app/integrations/social/<provider>
```

It is built from `FRONTEND_URL`, so it must match that value exactly. If
`FRONTEND_URL` changes, every registered redirect URI has to change with it.

### Bluesky needs no developer app

Bluesky authenticates with a handle and an
[app password](https://bsky.app/settings/app-passwords) entered directly in the
UI, so it is the one channel that works with no configuration at all. It is the
quickest way to verify the connect flow end to end.

## Known blockers

1. **Temporal server is not running yet.** The stack still serving traffic is
   the Railway one, which has no Temporal service, so the orchestrator has
   nothing to connect to and **no scheduled post will publish**. `render.yaml`
   fixes this, but a Blueprint cannot be activated through the API -- it needs
   one action in the Render dashboard, and it starts a paid subscription. See
   "Migrating to Render".
2. **No social platform credentials are configured**, so no channel can be
   connected. See "Connecting social channels".

## Verification status

| Check | Result |
|---|---|
| Supabase schema applied and verified against catalog | Pass |
| Supabase security advisor, ERROR level | 0 findings |
| Vercel frontend production build | Pass — deployed, READY |
| Vercel frontend actually serving | Pass — `/` and `/auth/login` both return HTTP 200 and render |
| Railway redis, temporal-postgres | Running — still the live stack until the cutover |
| Railway backend | Running — "Backend started successfully on port 3000" |
| Railway orchestrator | Running — idle, no Temporal server to poll |
| `render.yaml` schema | Parses; service and database plans as tabulated above |
| Render stack actually running | **Not verified** — the Blueprint has not been activated |
| API through the same-origin proxy | Pass — `GET /api/auth/can-register` returns HTTP 200 `{"register":true}` |
| Frontend points at the proxy | Pass — bundle contains `backendUrl:"https://soiklop-japheth-sunday.vercel.app/api"` |
| Login POST round trip | **Not verified from here** — the sandbox cannot issue POSTs to the deployment; needs a real browser sign-in |
| End-to-end publish flow | **Not verified** — blocked on Temporal (see above) |

### Database connection

Use the **transaction** pooler on port 6543. Session mode (5432) caps the
project at 15 client connections, and the backend and orchestrator each open a
Prisma pool plus Mastra's own pool, which exhausts it and produces
`EMAXCONNSESSION`.

The application connects as the `soiklop_app` role, not `postgres`. It owns
every object in `public` because Mastra and Prisma both ALTER their own tables
at startup, and it holds `BYPASSRLS` because the deny-all RLS exists to block
the PostgREST roles, not the application.

### Railway operational notes

- The Railway GitHub App is **not installed** on the repository, so auto-deploy
  is off. Pushes do not build; deployments must be triggered against an
  explicit commit SHA, and plain "redeploy" reuses the previous snapshot rather
  than picking up new commits.
- Do not set `NODE_OPTIONS` below ~2 GB. It applies to the build as well as the
  runtime, and `nest build` runs out of heap under it.
