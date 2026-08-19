# Soiklop — Implementation Status

This document records what has actually been built and verified, and what has
not. It is deliberately conservative: anything listed as unverified was not
tested, regardless of whether the code looks correct.

## Foundation

The platform is built on [Postiz](https://github.com/gitroomhq/postiz-app)
(AGPL-3.0), vendored at upstream commit `0b6dc6c` as the first commit on this
branch so every subsequent change is reviewable as a diff.

**Licensing note:** Postiz is AGPL-3.0. Network-facing deployments of a
derivative work must offer their source to users. This is a business decision
worth confirming before commercial launch.

### Architecture (as inspected, not as the README claims)

| Concern | Implementation |
|---|---|
| Monorepo | pnpm workspaces (`apps/*`, `libraries/*`); Nx removed but stale config remained |
| Backend | NestJS 11 (`apps/backend`) |
| Frontend | Next.js 16 + React 19 (`apps/frontend`) |
| Database | PostgreSQL via Prisma 6.5 — 40+ models in one schema |
| Background jobs | Temporal (`apps/orchestrator`), plus Redis/BullMQ remnants |
| Social integrations | 37 providers in `libraries/nestjs-libraries/src/integrations/social` |
| AI | `OpenAiService` + LangChain/Mastra agent graph |
| MCP | Present — `libraries/nestjs-libraries/src/chat/` with ~12 agent tools |
| Analytics | Per-provider `analytics()` methods on each social provider |
| Tests | **None.** Zero test files; jest config imported an uninstalled package |

## What this branch adds

### 1. Working test harness — verified

`jest.config.ts` imported `@nx/jest`, which is not a dependency, so `pnpm test`
aborted before collecting anything. Replaced with a self-contained ts-jest
setup (node + jsdom projects, workspace path mapping, UTC-pinned clock).

**Verified:** `npx jest` runs and passes.

### 2. Cross-platform content validation — verified

Providers expose `maxLength()` and an async `checkValidity()` that probes media
already on disk. Neither can answer "is this draft publishable?" before upload,
and media counts, kind-mixing, hashtag and link rules had no representation.

`libraries/nestjs-libraries/src/validation/` adds a declarative rules table for
the 12 prioritised platforms plus a pure validator that:

- judges each platform independently (valid for X ≠ valid for Instagram);
- prefers a live provider `maxLength()` when supplied, so X premium and X
  articles are honoured rather than flattened to the static 280;
- counts characters by code point, so emoji are not double-counted;
- emits an explicit `unknown-platform` **error** for an undocumented platform
  rather than defaulting it to valid;
- separates blocking errors from warnings (an off-spec aspect ratio warns,
  because platforms crop rather than reject).

**Verified:** 29 unit tests, including oversized media, over-long video,
unsupported media kinds, mixed media, and text-only posts on media-required
platforms.

### 3. Workspace capability model — verified

The shipped `PermissionsService` enforces **billing quotas**, not RBAC, and the
persisted `Role` enum has only `SUPERADMIN | ADMIN | USER`. There was no way to
express "may draft and generate but may not publish".

`libraries/nestjs-libraries/src/authorization/` adds six workspace roles over
the existing enum — no migration, no re-login:

- Publishing, scheduling and approving are capabilities distinct from creating
  and AI-generating. A Contributor drafts and generates but cannot schedule.
- **Automated actors** (MCP agents, unattended API tokens) are stripped of
  every high-impact capability unless a human delegates it individually. An
  agent authenticating with an Owner's token cannot inherit unrestricted
  publish rights.
- Stored `USER` maps to `EDITOR`, not `MANAGER`, so deploying this never
  silently grants existing members the ability to publish or self-approve.

**Verified:** 17 unit tests, including delegation scoping and the
unknown-role-grants-nothing case.

### 4. Provider-agnostic AI layer — partially verified

`OpenAiService` builds a module-level client and repeats the literal `gpt-4.1`
at nine call sites. `libraries/nestjs-libraries/src/ai/` adds an `AiProvider`
seam with Anthropic and OpenAI adapters, plus an OpenAI-compatible adapter that
reaches Azure / OpenRouter / vLLM by base URL.

- Vendor errors normalise to typed kinds, so retry logic never parses vendor
  error strings.
- `rate-limit`, `timeout`, `provider-unavailable` retry with exponential
  backoff; `authentication` and `invalid-request` fail fast.
- A refusal or content filter **raises** rather than returning empty text, so a
  blocked generation cannot be mistaken for an empty result.
- An unknown provider name is an error, never a silent substitution.

**Verified:** 42 unit tests against injected fake clients, covering retry,
backoff growth, non-retry of terminal errors, and env-driven configuration.

**Not verified:** no live call to Anthropic or OpenAI was made — both require
API keys that are not present in this environment. The request/response mapping
is tested against fakes shaped to the documented APIs, not against the real
services.

The existing `OpenAiService` is untouched and keeps serving current features.
Migrating its call sites onto this seam is follow-up work.

## Verification performed

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Passes |
| `pnpm run build:backend` | Passes |
| `npx jest` (88 tests) | Passes |
| Secret scan, tracked tree | Clean (one false positive: a Hashnode tag slug) |
| Secret scan, git history | N/A — history is a single squashed import, scanned as tree |
| `.env` ignored, only `.env.example` tracked | Confirmed |

## Not implemented

These remain from the original specification and are **not** present. They are
listed so the gap is explicit rather than implied by silence.

- **Schema additions:** `BrandProfile`, `Campaign`, `AuditLog` and a
  `PublishingJob` record (job id, attempt count, external platform id) are not
  modelled. The `State` enum still has only `QUEUE | PUBLISHED | ERROR | DRAFT`
  — the `IDEA`, `IN_REVIEW`, `APPROVED`, `PUBLISHING`, `CANCELLED` states are
  absent.
- **Approval workflow:** the capability model supports it, but no persistence,
  API or UI for submit → review → approve exists.
- **Campaign management and AI campaign planning.**
- **Brand profile injection into AI prompts.**
- **Analytics aggregation** across accounts/campaigns, and the AI performance
  intelligence layer over it.
- **Capability enforcement at the API boundary:** the capability model is a
  tested library; it is not yet wired into a NestJS guard, so controllers still
  use the original authorization.
- **Validator wiring:** the validation service is not yet called from the
  composer, the posts controller, or the publishing workflow.
- **Frontend work:** no UI was added or modified.
- **End-to-end and browser testing:** none performed. No database, Redis or
  Temporal instance was available in this environment, so integration and E2E
  flows (sign in → connect account → publish → analytics) were not exercised.
- **Live platform integration testing:** every social platform requires OAuth
  credentials that are not available here.

## Configuration added

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the Anthropic provider |
| `ANTHROPIC_MODEL` | Overrides the default (`claude-opus-5`) |
| `OPENAI_API_KEY` | Enables the OpenAI provider (already used by `OpenAiService`) |
| `OPENAI_MODEL` | Overrides the default (`gpt-4.1`) |
| `AI_PROVIDER` | Names the default provider when several are configured |
| `AI_COMPATIBLE_API_KEY` | Credential for an OpenAI-compatible gateway |
| `AI_COMPATIBLE_BASE_URL` | Gateway base URL (required with the key above) |
| `AI_COMPATIBLE_NAME` | Name the gateway is registered under |
| `AI_COMPATIBLE_MODEL` | Gateway default model |

All are optional. With none set, AI features report that no provider is
configured rather than failing obscurely.

## Running the tests

```bash
pnpm install
npx jest                      # all projects
npx jest --selectProjects node
npx jest --coverage
```
