# Deployment

Soiklop runs across three platforms, because no single one of them fits the
whole system.

| Component | Platform | Why |
|---|---|---|
| Database | Supabase (Postgres 17) | Managed Postgres, free tier |
| Frontend (Next.js) | Vercel | CDN, preview deployments |
| Backend (NestJS) | Railway | Needs a long-running HTTP process |
| Orchestrator (Temporal worker) | Railway | Needs a persistent worker process |
| Redis | Railway | Needs a persistent service |
| Temporal server | Railway | Needs a persistent service |

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
| Frontend | https://soiklop.vercel.app |
| Backend API | https://backend-production-28cf.up.railway.app |
| Supabase project ref | `bevoflswidqbuxfehzpi` (region `eu-west-1`) |
| Supabase API URL | https://bevoflswidqbuxfehzpi.supabase.co |

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

## Known blockers

1. **Temporal server is not provisioned.** Railway's free plan caps the project
   at four services (redis, backend, orchestrator, temporal-postgres). The
   Temporal server itself could not be created. Until it exists, the
   orchestrator has nothing to connect to and **no scheduled post will
   publish**. Fix: upgrade the Railway plan and add a
   `temporalio/auto-setup:1.28.1` service pointed at `temporal-postgres`, or
   use Temporal Cloud and set `TEMPORAL_ADDRESS` accordingly.
2. **`DATABASE_URL` is unset**, so the backend cannot reach Supabase yet.

## Verification status

| Check | Result |
|---|---|
| Supabase schema applied and verified against catalog | Pass |
| Supabase security advisor, ERROR level | 0 findings |
| Vercel frontend production build | Pass — deployed, READY |
| Railway redis | Running |
| Railway backend / orchestrator | Build triggered; **not yet verified running** |
| End-to-end publish flow | **Not verified** — blocked on Temporal and `DATABASE_URL` |
