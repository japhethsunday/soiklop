# Soiklop

A social media operations platform: connect multiple accounts, create and adapt
content with AI, schedule and publish across platforms, and track performance
from one dashboard.

Soiklop is built on [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0)
and extends it. See [Relationship to Postiz](#relationship-to-postiz) for what
that means for licensing.

## Status

The platform is deployed and in use. What works today, and what does not:

| Area | State |
|---|---|
| Registration, login, sessions | Working |
| Dashboard, calendar, drafts | Working |
| Media library | Working |
| Social account connection (OAuth) | Working once platform credentials are configured |
| REST API and MCP surface | Working |
| Analytics views | Working |
| **Scheduled publishing** | **Requires a Temporal server — see [Publishing](#publishing)** |
| AI generation | Requires an AI provider key |

## Architecture

A pnpm monorepo. No single host fits the whole system, so it runs across three.

| Component | Path | Runs on | Why |
|---|---|---|---|
| Frontend | `apps/frontend` | Vercel | Next.js 16 + React 19 |
| Backend API | `apps/backend` | Railway | NestJS; needs a long-running process |
| Orchestrator | `apps/orchestrator` | Railway | Temporal worker; must stay resident |
| Shared libraries | `libraries/*` | — | Providers, database, helpers |
| Database | — | Supabase | PostgreSQL via Prisma |
| Queue / cache | — | Railway | Redis |

The backend **cannot** run on a serverless platform. `apps/orchestrator` is a
Temporal worker that executes every publish; without a resident process,
scheduled posts sit in the queue forever while the UI reports them as
scheduled. Full reasoning in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Quick start

Requires Node 22.x and pnpm 10.6.1.

```bash
pnpm install
cp .env.example .env          # then fill in the values below
pnpm run prisma-db-push       # create the schema
pnpm run dev                  # frontend on :4200, backend on :3000
```

`docker-compose.dev.yaml` provides Postgres, Redis and Temporal locally:

```bash
pnpm run dev:docker
```

## Configuration

Every variable is documented in `.env.example`. The minimum to boot:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Session signing secret — use a long random value |
| `FRONTEND_URL` | Public URL of the frontend |
| `NEXT_PUBLIC_BACKEND_URL` | URL the browser uses to reach the API |
| `BACKEND_INTERNAL_URL` | URL the frontend uses server-side |

### Branding

`NEXT_PUBLIC_APP_NAME` sets the product name shown in page titles and UI copy.
It defaults to `Soiklop`.

### AI providers

The AI layer is provider-agnostic. Configure any subset; each provider with
credentials is registered, and `AI_PROVIDER` selects the default. With none
set, AI features report that no provider is configured rather than failing
obscurely.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Anthropic (default model `claude-opus-5`) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAI (default `gpt-4.1`) |
| `AI_COMPATIBLE_API_KEY` / `AI_COMPATIBLE_BASE_URL` | Any OpenAI-compatible gateway |
| `AI_PROVIDER` | Which of the above is the default |

### Social platforms

Each platform needs its own OAuth credentials (`X_API_KEY`, `LINKEDIN_CLIENT_ID`,
`FACEBOOK_APP_ID`, …) — all listed in `.env.example`. An integration stays
inert until its credentials are supplied. **No platform is claimed as working
until its credentials are configured and a real post succeeds.**

## Publishing

Publishing runs through Temporal, not an in-process timer. That means a
publish is durable, retryable, and idempotent — a retry after an unknown
outcome will not double-post.

It requires three things: the backend, the orchestrator worker, and a Temporal
server. If Temporal is unreachable the API still starts and logs the failure,
so authentication and the dashboard keep working, but **scheduling and
publishing fail loudly at the point of use**. A post is never reported as
published unless the platform accepted it.

## Testing

```bash
npx jest                        # everything
npx jest --selectProjects node  # backend and shared libraries
npx jest --coverage
```

Covered today: cross-platform content validation, the workspace capability
model, and the AI provider abstraction including retry and failure handling.

Controller-level integration tests currently cannot run — importing a
controller pulls in an ESM jsdom stack and an uncompiled native addon that
Jest's CJS runtime cannot load. The cause and three possible fixes are recorded
in [`docs/PLATFORM_STATUS.md`](docs/PLATFORM_STATUS.md).

## Documentation

| Document | Contents |
|---|---|
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Deployment topology, database setup, security lockdown, known blockers |
| [`docs/PLATFORM_STATUS.md`](docs/PLATFORM_STATUS.md) | What is built and verified, what is not, and why |
| `.env.example` | Every configuration variable |

## Security

- No secrets are committed. `.env` is ignored; only `.env.example` is tracked.
- OAuth tokens and credentials are never exposed to the frontend.
- On Supabase, the `public` schema is exposed to PostgREST via a publishable
  key. Row-level security is enabled with no policies and API-role grants are
  revoked, so that surface is closed. **Re-run the lock snippet in
  `docs/DEPLOYMENT.md` after any migration that adds tables** — new tables
  arrive without RLS.

## Relationship to Postiz

Soiklop is a derivative of Postiz and is therefore **AGPL-3.0**. If you deploy
it as a network service, the AGPL requires you to offer the source to your
users. Confirm this is acceptable before any commercial deployment.

The original project is worth supporting: <https://github.com/gitroomhq/postiz-app>

## License

[AGPL-3.0](LICENSE)
