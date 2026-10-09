# sim-core

The shared engine behind the sim fleet — a set of synthetic companies that
generate realistic partner-ecosystem traffic against the partner-api platform.

One `SimCoreModule.forRoot(config)` import gives a NestJS service:

- `GET /health`, `GET /openapi.json` (with `ETag` + `Last-Modified`)
- a **chaos layer** (latency, error rate, malformed responses, hard rejects)
- a **scenario registry** — named, parameterised, TTL-bounded, self-reverting
- a **traffic driver** — weighted flows, seeded RNG, rhythm curve, hard rate cap
- the **`/__control` plane** — bearer-authenticated operator API
- an **admin SPA** at `/admin`
- a **request tail** — in-memory ring buffer of the last 200 requests
- **v0.2.0** — an opt-in **docs engine** (`/docs`, versioned OpenAPI specs,
  guides, changelog, SQLite-backed) and **webhook verification helpers**
- **v0.3.0** — an opt-in **Google-OIDC gate** in front of `/admin`
- **v0.4.0** — when that gate is on, its session **also authorizes
  `/__control`** — one tier for humans instead of two (see below).
  **v0.4.1** corrects the boot-log line for this (it still said `/__control`
  was unaffected); no behavior change.
- **v0.5.0** — a redesigned **`/admin`** (status first, scenarios as a
  runbook, manual controls, activity, advanced, danger zone) plus two
  additive, optional hooks for it: `Scenario.admin` metadata and
  `SimCoreConfig.adminActions`. No route, scenario or default changed.

---

## What changed in v0.5.0

The admin SPA was redesigned around what an operator asks first: *what is this
sim doing right now*, and *run scenario X now*. The critique and the full
before/after function map are in
[`docs/admin-ux-review.md`](docs/admin-ux-review.md). Nothing on the server
changed behaviour; everything below is additive and optional.

| Added | Opt-in? |
|---|---|
| `Scenario.admin` (`ScenarioAdminMeta`: `title`, `triggers`, `group`, `durable`, `undo`, `defaultTtlSeconds`, `order`) — presentation only | yes — a scenario without it lists and runs as before |
| `admin` field on each `GET /__control/scenarios` entry (`null` when undeclared) | no — additive field |
| Admin metadata on the four built-ins (`Error storm`, `Full outage`, `Slow responses`, `Reject all credentials`) | no — presentation only |
| `SimCoreConfig.adminActions` (`AdminAction[]`) — buttons for a consumer's own `/__control/*` routes, validated at bootstrap to stay under `/__control/` | yes |
| `GET /__control/actions` → `{ actions }` | no — additive route, behind the control guard |
| SPA: status header, runbook, received-webhooks view, confirmations on permanent and destructive actions | no |

A consumer that repins without touching its config gets the new layout with
its scenarios under a generic "Scenarios" heading, titled by id.


## What changed in v0.4.0

One change, and only when `adminAuth` is enabled: `ControlAuthGuard` now
accepts a valid `adminAuth` session cookie as an alternative to
`Authorization: Bearer ${CONTROL_TOKEN}` — not a replacement for it, either
credential works, and automation using the bearer token is unaffected.
Previously, signing in with Google only unlocked *viewing* `/admin`; operating
it — activating a scenario, publishing a spec version, resetting — still
required pasting `CONTROL_TOKEN` into the SPA, found only in Render's
dashboard. That second tier is gone: anyone who can sign in can now do both.

This is a deliberate security-model change, not a bug fix — see
["One tier for humans"](#admin-spa-admin) below for the CSRF reasoning and why
the session cookie's `Path` moved from `/admin` to `/`. When `adminAuth` is
off or absent, nothing changed: `test/backcompat.spec.ts` still proves
byte-for-byte v0.1.0–v0.3.0 behaviour.

## What changed in v0.3.0

One addition: **`adminAuth`**, an optional Google sign-in gate for the admin
SPA. It is **off by default** and there is no other change — no rename, no
route moved, no default altered. A consumer repins the tag, redeploys, and
gets byte-for-byte its v0.2.0 behaviour;
`test/backcompat.spec.ts` has a block dedicated to proving exactly that.

| Added | Opt-in? |
|---|---|
| `adminAuth` config, the `/admin` gate, `GET /admin/auth/callback`, `GET /admin/auth/logout` | yes — `adminAuth.enabled` |
| `adminAuth` boolean on `GET /__admin/brand` | no — additive field |
| A **Sign out** link in the admin SPA header | no — only rendered when the gate is on |
| Exports: `AdminAuthService`, `verifyGoogleIdToken`, `GoogleJwksCache`, `resolveAdminAuthConfig`, … | no — import when wanted |

### What is gated, and what is deliberately not

**Gated:** the `/admin` SPA, its assets, and every other path under `/admin`.

**Never gated, when the gate is on:**

| Surface | Why |
|---|---|
| the consumer's domain API (`/v1`, `/v2`, …) | it is the traffic the fleet exists to generate |
| `GET /docs`, `GET /docs/*` | the platform's documentation pipeline polls and diffs these |
| `GET /openapi.json` | the platform HEAD-probes it; a 302 here reads as an upstream that deleted its API |
| `GET /health` | Render's health check |
| webhook receivers | the platform signs and POSTs them |
| `GET /__admin/brand` | display-only, and the SPA shell needs it — see the audit note below |
| **all of `/__control/*`** | **bearer `CONTROL_TOKEN`, unchanged.** Every piece of fleet automation drives these |

The line is human surface vs machine surface, and it is enforced by tests: the
whole `machine surfaces are untouched` block in `test/admin-auth.spec.ts` runs
against an app with the gate **enabled**.

> **`/__admin/brand` audit (done for v0.3.0, not assumed).** The payload is
> `{ name, version, brand: { displayName, color, tagline }, docs, adminAuth }`.
> No credentials, no hostnames, no counts, no runtime state; and both booleans
> are already observable without it (`/docs` answers 200 or 404, the gate
> announces itself with a 302). It stays open because the SPA needs it before a
> session exists. `test/builtins.spec.ts` asserts the **exact key set**, so
> adding a field to this unauthenticated payload fails a test rather than
> quietly widening the surface.

---

## What changed in v0.2.0

**Every export, route and config field from v0.1.0 still works unchanged.**
Docs are off by default, so a consumer can repin the tag and redeploy without
touching its config — `test/backcompat.spec.ts` exists to keep that true.

The one thing a repin *does* require is the **package rename to
`@okjake/sim-core`** — see the boxed note under [Install](#install). It is a
rename only; no behaviour moved with it.

| Added | Opt-in? |
|---|---|
| Docs engine: `/docs`, `/docs/reference`, `/docs/guides/:slug`, `/docs/changelog`, versioned specs on `/openapi.json` | yes — `docs.enabled` |
| Storage module (`better-sqlite3`, `DATA_DIR`, versioned migrations) | yes — used only by the docs engine |
| `/__control/docs/*` editor API and the admin SPA's **Docs** tab | yes — follows `docs.enabled` |
| `POST /__control/reset-docs` | yes — 404s when docs are off |
| Webhook helpers (`verifyPlatformWebhook` and friends) | no — pure functions, import when wanted |
| `GET /__control/webhooks` + `WebhookRecorderService` | no — always on, in-memory, ~nothing |
| `If-Modified-Since` handling on `/openapi.json` | no — strictly more correct |
| `docs` field on `GET /__admin/brand` | no — additive field |

The only observable change for a docs-disabled service is the additive
`docs: false` field on `/__admin/brand`, the new `/__control/webhooks` route,
and `/openapi.json` now honouring `If-Modified-Since` as well as
`If-None-Match`.

---

## OPERATIONS — what this actually is

This is not a product. It is long-lived test infrastructure. Three fictional
companies (`sim-staybase`, `sim-bookbridge`, and later `sim-pebblepay`) run as
real deployed services calling each other over real HTTP, so the partner-api
platform has a continuous, controllable stream of genuine partner traffic to
observe. `sim-core` is the shared engine all of them consume.

Two rules the design enforces rather than documents:

1. **Every mutation of behaviour has a mandatory TTL** (1–86400s) and reverts
   itself. There is no way to leave a sim service broken indefinitely.
2. **The traffic driver has a hard requests/minute cap** checked immediately
   before every single request, so no scenario, mode, multiplier or rhythm
   value can turn a sim company into a load generator.

`POST /__control/reset` is the kill switch. Chaos never applies to
`/__control`, `/__admin`, `/health` or `/admin`, so the kill switch stays
reachable during an outage scenario. `/openapi.json` and `/docs` are exempt too
unless a consumer sets `docsChaosOptIn: true` — an outage that also broke the
spec endpoint would look to the platform like an upstream that deleted its API,
which is a different (and much louder) event than the one being simulated.

A third rule arrives with v0.2.0: **documentation is durable state.** Docs
edits and publishes have no TTL and do not auto-revert, because a spec version
that unpublished itself after ten minutes would be indistinguishable from a
real upstream rollback. `POST /__control/reset-docs` is their separate,
explicit reset, and `content/` in the consumer repo is the baseline it restores.

---

## Install

sim-core is consumed as a pinned git dependency. Add to the consumer's
`package.json`:

```json
{
  "dependencies": {
    "@okjake/sim-core": "github:okjake/sim-core#v0.4.1"
  }
}
```

```ts
import { SimCoreModule, bootstrapSimService } from '@okjake/sim-core';
```

Then `pnpm install`.

> ### ⚠️ v0.2.0 renames the package to `@okjake/sim-core`
>
> **This is the one breaking change in v0.2.0, and it is a rename, not a
> behaviour change.** The unscoped name `sim-core` is taken on the public npm
> registry by an unrelated 2019 package. Even though we install from GitHub,
> an unscoped name that resolves to somebody else's package on the default
> registry is a dependency-confusion foothold — one misconfigured registry or
> one `npm install sim-core` typo and a consumer is running a stranger's code.
> A scope closes it.
>
> **The GitHub repo is still `okjake/sim-core`**, so the git ref
> (`github:okjake/sim-core#v0.2.0`) is unchanged. Only the npm package name
> moved.
>
> Repinning from v0.1.0 therefore takes **two** edits, not one:
>
> 1. **The dependency key** in `package.json`:
>    ```diff
>    -    "sim-core": "github:okjake/sim-core#v0.1.0"
>    +    "@okjake/sim-core": "github:okjake/sim-core#v0.2.0"
>    ```
> 2. **Every import specifier** in the consumer's source:
>    ```diff
>    -import { SimCoreModule } from 'sim-core';
>    +import { SimCoreModule } from '@okjake/sim-core';
>    ```
>    ```bash
>    # from the consumer repo root
>    grep -rl "from 'sim-core'" src | xargs sed -i '' "s|from 'sim-core'|from '@okjake/sim-core'|g"
>    ```
>
> Miss the second and the build fails loudly at import time — pnpm's strict
> `node_modules` will not resolve the old specifier — so there is no silent
> failure mode here. Delete the stale `node_modules/sim-core` entry with a
> clean `pnpm install` after the change.
>
> Nothing else about the upgrade is breaking: every export, route and config
> field from v0.1.0 still works exactly as it did.

### pnpm caveats (verified, not guessed)

- **`dist/` is committed.** pnpm only builds a git dependency if it declares a
  `prepare` script; sim-core deliberately has none, so pnpm just unpacks the
  repo and the prebuilt library + admin SPA are there immediately. This is the
  reliable option — a `prepare`-based build would need devDependencies
  (TypeScript, Vite, React) installed inside every consumer's store on every
  install, and is skipped entirely under `--ignore-scripts` / restricted CI.
- **Pin a tag, not a branch.** `#v0.2.0` resolves to an immutable commit.
  `github:okjake/sim-core` (no ref) tracks the default branch and will drift.
- Peer dependencies are **not** bundled. The consumer must already depend on
  `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`,
  `reflect-metadata` and `rxjs` (all ^11 / ^0.2 / ^7 respectively). pnpm's
  strict node_modules means a missing peer is a hard failure at import time,
  not a subtle one.
- sim-core brings two runtime dependencies of its own: `@nestjs/serve-static`
  (for `/admin`) and `better-sqlite3` (for the docs engine).
- **`better-sqlite3` needs no build step** — verified, not assumed. v13 ships
  prebuilt `.node` binaries for linux/darwin/win × x64/arm64 (plus musl) inside
  the npm tarball, so it loads correctly even though pnpm 10 blocks dependency
  build scripts by default and even under `--ignore-scripts`. You do **not**
  need `pnpm approve-builds` or an `onlyBuiltDependencies` entry. CI asserts
  this on every run. It is installed for every consumer, but only *loaded* when
  `docs.enabled` is true — the `require` is lazy, inside `SimStorage`.
- Bumping the tag: change the ref, then `pnpm install`. pnpm caches git deps by
  resolved commit, so a moved tag needs `pnpm store prune` or a fresh ref.
- **The repo is private, so the install needs git credentials.** pnpm probes
  for SSH access and, when it finds it, rewrites `github:okjake/sim-core#v0.2.0`
  to `git@github.com:okjake/sim-core.git` — which is what a developer machine
  with a GitHub SSH key gets. CI without an SSH key falls back to HTTPS and
  will fail on a private repo unless you give it a token:

  ```yaml
  - run: git config --global url."https://x-access-token:${{ secrets.GH_PAT }}@github.com/".insteadOf "https://github.com/"
  - run: pnpm install --frozen-lockfile
  ```

  (or add a deploy key and keep the SSH path). A PAT with `repo` read scope is
  enough.
- The lockfile pins the **annotated tag object's** SHA, not the commit SHA.
  That is still immutable and resolves correctly — don't "fix" it.

Requires **Node 22+**.

---

## Quick start

```ts
// config.ts
import { p, type SimCoreConfig } from '@okjake/sim-core';
import openapi from './openapi.json';

export const config: SimCoreConfig = {
  name: 'staybase',
  brand: { displayName: 'Staybase', color: '#2f6f4f', tagline: 'Stays, simplified' },
  openapi,
  controlToken: process.env.CONTROL_TOKEN!,
  version: '1.0.0',
  scenarios: [myCustomScenario],
  // driver: { ... }  // omit for services that only receive traffic
};
```

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { SimCoreModule } from '@okjake/sim-core';

import { config } from './config';
import { ListingsController } from './listings.controller';

@Module({
  imports: [SimCoreModule.forRoot(config)],
  controllers: [ListingsController],
})
export class AppModule {}
```

```ts
// main.ts
import 'reflect-metadata';
import { bootstrapSimService } from '@okjake/sim-core';

import { AppModule } from './app.module';
import { config } from './config';

void bootstrapSimService(AppModule, config);
```

A complete working service lives in [`examples/demo`](./examples/demo) — a
dummy domain controller, a custom driver-level scenario, and the config that
ties them together. The test suite runs against it.

---

## Public API surface

Everything below is exported from the package root
(`import { … } from '@okjake/sim-core'`).

### Module + bootstrap

| Export | Signature |
|---|---|
| `SimCoreModule` | `SimCoreModule.forRoot(config: SimCoreConfig): DynamicModule` — global module |
| `bootstrapSimService` | `(appModule: unknown, config: SimCoreConfig, options?: BootstrapSimServiceOptions) => Promise<INestApplication>` |
| `BootstrapSimServiceOptions` | `{ port?: number; host?: string; listen?: boolean; logger?: NestApplicationOptions['logger'] }` |

### Config

```ts
const SIM_CORE_CONFIG: 'SIM_CORE_CONFIG'; // DI token for the normalised config

interface SimCoreConfig {
  name: string;                  // machine name, e.g. 'staybase'
  brand: SimBrand;
  openapi: OpenApiDocument;      // served at GET /openapi.json
  scenarios?: Scenario<any>[];   // appended to (and able to override) built-ins
  driver?: DriverConfig;         // omit for receive-only services
  controlToken: string;          // >= 16 chars; from env CONTROL_TOKEN
  version?: string;              // default '0.0.0'
  seed?: number | string;        // chaos seed; default `${name}-chaos`
  requestTailSize?: number;      // default 200
  admin?: boolean;               // serve /admin; default true
  port?: number;                 // used by bootstrapSimService; default PORT || 3000

  // --- v0.2.0, all optional ---
  docs?: DocsConfig;                       // docs engine; DISABLED by default
  docsAuthCheck?: (req: Request) => boolean;  // credential check for docs.authMode 'required'
  docsChaosOptIn?: boolean;                // let chaos hit /docs + /openapi.json; default false
  webhookHistorySize?: number;             // GET /__control/webhooks ring buffer; default 50

  // --- v0.3.0, optional ---
  adminAuth?: AdminAuthConfig;             // Google gate for /admin; DISABLED by default
}

interface AdminAuthConfig {
  enabled: boolean;                        // master switch; everything below is required when true
  googleClientId: string;                  // GOOGLE_CLIENT_ID
  googleClientSecret: string;              // GOOGLE_CLIENT_SECRET — server-side only
  allowedDomain: string;                   // ADMIN_ALLOWED_DOMAIN, e.g. 'partnerapi.com'
  allowedEmails?: string[];                // optional narrowing inside the domain
  sessionSecret: string;                   // ADMIN_SESSION_SECRET, >= 32 chars
  sessionTtlHours?: number;                // default 12
  callbackPath?: string;                   // default '/admin/auth/callback'; must be under /admin/

  // escape hatches — test injection and self-hosting knobs, all optional
  fetchImpl?: AdminAuthFetch;              // token exchange + JWKS; default global fetch
  publicBaseUrl?: string;                  // override the redirect_uri origin
  secureCookie?: boolean;                  // override the Secure derivation
  cookieName?: string;                     // default 'sim_admin_session'
  stateTtlSeconds?: number;                // default 600
  jwksCacheTtlSeconds?: number;            // default 3600
  clockSkewSeconds?: number;               // default 120
  authorizationEndpoint?: string;          // default https://accounts.google.com/o/oauth2/v2/auth
  tokenEndpoint?: string;                  // default https://oauth2.googleapis.com/token
  jwksUri?: string;                        // default https://www.googleapis.com/oauth2/v3/certs
}

interface DocsConfig {
  enabled?: boolean;                       // default false
  authMode?: 'public' | 'required';        // default 'public'
  contentDir?: string;                     // default `${cwd}/content`
  seedOnBoot?: boolean;                    // seed when the tables are empty; default true
  dataDir?: string;                        // overrides DATA_DIR
  databaseFile?: string;                   // abs path, name in dataDir, or ':memory:'; default 'docs.sqlite'
  databaseDriver?: SqlDatabaseFactory;     // test injection point; default better-sqlite3
  title?: string;                          // default `${brand.displayName} developer docs`
  intro?: string;                          // markdown blurb on /docs; must be static
}

interface SimBrand { displayName: string; color: string; tagline?: string }

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string } & Record<string, unknown>;
  paths?: Record<string, unknown>;
  [key: string]: unknown;
}

function normalizeSimCoreConfig(config: SimCoreConfig): SimCoreConfig; // throws on bad config
```

`normalizeSimCoreConfig` runs inside `forRoot` and **throws at bootstrap** on:
a missing `name`; a `controlToken` shorter than 16 characters; an `openapi`
without `openapi`/`info`; a `driver` without `baseUrl`; a
`maxRequestsPerMinute` that is not `> 0`; `docs.authMode: 'required'`
without a `docsAuthCheck` (failing closed beats silently serving docs that were
meant to be credentialed); and — new in v0.3.0 — an **`adminAuth` that is
enabled but incomplete**: a missing client id, client secret or allowed domain,
a `sessionSecret` under 32 characters, a non-positive `sessionTtlHours`, a
`callbackPath` outside `/admin/`, or an `allowedEmails` that is empty or not
made of addresses. All of those fail at boot rather than at the first sign-in,
because the failure mode of a half-configured gate is an admin console open to
the internet. An **absent or disabled** `adminAuth` is validated not at all,
which is what keeps a v0.2.0 config working untouched.

**v0.5.0 — `adminActions`.** An optional `AdminAction[]` that puts a button on
`/admin` for a route the consumer already registered under `/__control/`
(Staybase's `push-metrics`, Pebblepay's `auth-scheme`). It registers nothing:
each entry is `{ id, title, description, path, triggers?, submitLabel?,
confirm?, persistent?, choice? }`, where `choice` (`{ name, label, options,
currentPath?, currentKey? }`) sends `{ [name]: value }` as the POST body and
can read the current value from a GET. Bootstrap throws on a duplicate id, a
missing title, or a `path`/`currentPath` outside `/__control/`, because the SPA
sends the operator's credential to it.

`openapi` stays **required even with docs enabled**. It is the fallback served
at `/openapi.json` before anything has been published, so a sim always answers
a spec probe with something valid.

### Scenarios

```ts
type RevertFn = () => void | Promise<void>;

interface Scenario<P = any> {
  id: string;
  description: string;
  params?: ParamSchema<P>;                       // optional; see "Params" below
  admin?: ScenarioAdminMeta;                     // v0.5.0, optional; /admin presentation only
  apply(ctx: ScenarioContext, params: P): RevertFn | Promise<RevertFn>;
}

interface ScenarioAdminMeta {                    // every field optional
  title?: string;               // 'Error storm' — defaults to the id
  triggers?: string[];          // Partner API automations it should set off
  group?: string;               // runbook section; built-ins use 'Generic faults'
  durable?: boolean;            // effect does not revert at TTL — SPA confirms; duration moves under Options
  undo?: string;                // how to undo a durable scenario
  defaultTtlSeconds?: number;   // pre-selected duration (default 300)
  order?: number;               // sort within the group
}

interface ScenarioContext {
  chaos: ChaosControl;
  driver: DriverControl;
  rng: Rng;                                      // seeded from config.seed + scenario id
  logger: Logger;                                // @nestjs/common Logger
  service: { name: string; brand: SimBrand };
}

interface ScenarioListing { id: string; description: string; params: unknown | null; admin: ScenarioAdminMeta | null }

interface ActiveScenarioState {
  id: string; description: string; params: unknown;
  activatedAt: string; expiresAt: string;        // ISO-8601
  ttlSeconds: number; remainingSeconds: number;
}

class ScenarioRegistryService {
  register(scenario: Scenario): void;
  has(id: string): boolean;
  get(id: string): Scenario | undefined;
  ids(): string[];
  list(): ScenarioListing[];
}
```

**`apply` must return a revert function.** If it returns anything else the
activation is rejected with 400. If the revert function throws at expiry,
sim-core logs it and force-clears chaos + driver state anyway.

Built-in scenarios (exported individually and as `BUILTIN_SCENARIOS`):

| id | params (all optional, defaults shown) | effect |
|---|---|---|
| `latency` | `baseMs=750`, `jitterMs=250`, `pathPrefix?` | delay every matching response |
| `error-spike` | `rate=0.25`, `status=500`, `pathPrefix?` | fail a fraction of requests |
| `outage` | `status=503`, `pathPrefix?` | reject every matching request |
| `auth-failure` | `status=401`, `pathPrefix?` | reject every matching request as unauthenticated |

Exports: `latencyScenario`, `errorSpikeScenario`, `outageScenario`,
`authFailureScenario`, `BUILTIN_SCENARIOS`.

A consumer scenario with the same `id` as a built-in replaces it.

### Chaos

```ts
interface ChaosControl {
  apply(rule: ChaosRule): () => void;   // returns a revert fn for exactly that rule
  clear(): void;
  rules(): ActiveChaosRule[];
}

interface ChaosRule {
  id?: string;
  pathPrefix?: string;                             // omit for global
  latency?: { baseMs: number; jitterMs?: number };
  errorRate?: { rate: number; status: number; message?: string };
  malformedResponse?: { mode: 'drop-fields' | 'wrong-types' | 'truncate'; rate?: number };
  reject?: { status: number; message?: string };
}
```

Also exported: `ChaosService` (implements `ChaosControl`), `ChaosInterceptor`,
`CHAOS_EXEMPT_PREFIXES`, `isChaosExempt(path)`, and the primitive types
`LatencyPrimitive`, `ErrorRatePrimitive`, `MalformedResponsePrimitive`,
`RejectPrimitive`, `ActiveChaosRule`.

Observable side effects on affected responses:

| Header | Meaning |
|---|---|
| `x-sim-chaos` | comma-separated list of applied primitives (`reject`, `error-rate`, `latency`, `malformed`) |
| `x-sim-chaos-latency-ms` | the delay actually applied |
| `x-sim-chaos-malformed` | the malformed mode used |

Rules are additive: latency accumulates across matching rules; other
primitives take the last matching rule's value.

### Traffic driver

```ts
type DriverMode = 'baseline' | 'burst' | 'paused';

interface DriverConfig {
  baseUrl: string;
  flows: FlowDefinition[];
  baselineRequestsPerMinute: number;   // target at multiplier 1, rhythm 1
  maxRequestsPerMinute: number;        // HARD CAP — enforced before every request
  seed?: number | string;
  jitterRatio?: number;                // default 0.35
  rhythm?: RhythmCurve;                // { weekday: number[24]; weekend: number[24] }
  defaultMode?: DriverMode;            // default 'baseline'
  autoStart?: boolean;                 // default true (false under NODE_ENV=test)
  headers?: Record<string, string> | (() => Record<string, string>);
  timeoutMs?: number;                  // default 10000
  fetchImpl?: FetchLike;               // injection point for tests
}

interface FlowDefinition { id: string; description?: string; weight: number; steps: FlowStep[] }

interface FlowStep {
  name: string;
  request(state: FlowState, ctx: FlowContext): FlowRequest | null;   // null skips the step
  onResponse?(res: FlowResponse, state: FlowState, ctx: FlowContext): void | Promise<void>;
}

interface FlowRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;                                   // relative to baseUrl
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

interface FlowResponse {
  status: number; ok: boolean; body: unknown;
  headers: Record<string, string>; latencyMs: number; error?: string;
}

type FlowState = Record<string, unknown>;         // per-run scratchpad, shared across steps
interface FlowContext { rng: Rng; flowId: string; memory: Record<string, unknown> }

type RequestMutator = (
  req: FlowRequest,
  ctx: { flowId: string; stepName: string },
) => FlowRequest;

interface DriverControl {
  isConfigured(): boolean;
  getMode(): DriverMode;
  getMultiplier(): number;
  setMode(mode: DriverMode, multiplier?: number): void;
  resetMode(): void;
  addRequestMutator(mutator: RequestMutator): () => void;
  status(): DriverStatus;
}
```

`DriverService` implements `DriverControl` and additionally exposes
`start()`, `stop()`, `reset()`, `clearRequestMutators()`, `tick(now?)`,
`rhythmMultiplier(at?)`, `effectiveRequestsPerMinute(at?)`,
`requestsLastMinute(now?)` and `nextTick()`.

How the loop works: **one HTTP request per tick.** A tick pulls the next step
of the in-progress flow, or weighted-picks a new flow when none is running.
Consecutive steps of a flow are consecutive ticks, sharing `FlowState`. The
interval between ticks is `60000 / effectiveRPM`, jittered by `±jitterRatio`.
`effectiveRPM = baselineRPM × modeMultiplier × rhythm(hour)`, clamped to
`maxRequestsPerMinute`; a sliding 60s window is re-checked immediately before
every request, so the cap holds even if the clamp were bypassed.

**Driver-level scenario hooks.** Some scenarios need to change what the driver
*sends*, not how the service *responds* (`sim-bookbridge`'s
`malformed-payloads` and `expired-api-key` are exactly this). Use
`ctx.driver.addRequestMutator` and return its removal function:

```ts
export const expiredApiKey: Scenario = {
  id: 'expired-api-key',
  description: 'Driver sends a stale bearer token, so upstream returns 401s.',
  apply: (ctx) =>
    ctx.driver.addRequestMutator((req) => ({
      ...req,
      headers: { ...req.headers, authorization: 'Bearer expired-key' },
    })),
};
```

Every random decision in the driver comes from the seeded RNG — same seed,
same flow order, same jitter, same in-flow choices. There is no `Math.random()`
in driver logic and a test asserts that.

### Params ("zod-ish")

`ParamSchema<T>` is structurally `{ parse(input: unknown): T; describe?(): ParamFieldDescription }`,
so a real zod schema satisfies it. The bundled builders additionally implement
`describe()`, which is what `GET /__control/scenarios` publishes so the admin
SPA can render a form:

```ts
import { p } from '@okjake/sim-core';

params: p.object({
  rate: p.number({ min: 0, max: 1 }).default(0.25).describedAs('Failure rate'),
  status: p.number({ min: 400, max: 599 }).default(500),
  scope: p.enum(['all', 'writes'] as const).default('all'),
  note: p.string().optional(),
})
```

Builders: `p.object`, `p.number({min,max})`, `p.string()`, `p.boolean()`,
`p.enum([...])`. Each returns a schema with `.optional()`, `.default(v)`,
`.describedAs(text)`. Also exported: `describeSchema`, `ParamValidationError`,
and the types `ParamSchema`, `ParamFieldDescription`, `Infer`.

### Seeded RNG

```ts
function createRng(seed?: number | string): Rng;
function hashSeed(input: string): number;

interface Rng {
  readonly seed: number;
  next(): number;                    // [0, 1)
  int(min: number, max: number): number;      // inclusive
  float(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  weightedPick<T>(items: readonly T[], weightOf: (item: T) => number): T;
  derive(label: string): Rng;        // independent stream from the same seed
}
```

### Request tail

```ts
const REQUEST_TAIL_CAPACITY = 200;

interface RequestTailEntry {
  seq: number; at: string;           // ISO-8601
  method: string; path: string; status: number; latencyMs: number;
  chaos?: string[];
}

class RequestTailService {
  record(entry: Omit<RequestTailEntry, 'seq' | 'at'>): RequestTailEntry;
  list(limit?: number): RequestTailEntry[];   // newest first
  size(): number;
  clear(): void;
}
```

Also exported: `RequestTailMiddleware` (applied to all routes by the module).

### Storage (v0.2.0)

A thin `better-sqlite3` wrapper with a versioned migration table. **Only the
docs engine uses it** — chaos, driver, request-tail and webhook state stay in
memory by design, because they are supposed to vanish on restart.

```ts
const DEFAULT_DATA_DIR = './data';

function resolveDataDir(override?: string): string;          // override › DATA_DIR › ./data
function resolveDatabaseFile(file?: string, dataDir?: string): string;

interface Migration { id: string; sql: string }              // id is immutable once shipped

class SimStorage {
  constructor(options?: StorageOptions);
  readonly file: string;
  readonly db: SqlDatabase;
  migrate(migrations: Migration[]): AppliedMigration[];      // applies only what is missing
  applied(): AppliedMigration[];
  stmt(sql: string): SqlStatement;                           // prepared-statement cache
  transaction<A extends unknown[], R>(fn: (...a: A) => R): (...a: A) => R;
  close(): void;
}

interface StorageOptions {
  file?: string;                 // default 'docs.sqlite'; ':memory:' supported
  dataDir?: string;              // overrides DATA_DIR
  driver?: SqlDatabaseFactory;   // (filename) => SqlDatabase, for tests
  migrations?: Migration[];      // applied on open
}
```

`DATA_DIR` defaults to `./data` and is gitignored. On Render it must be the
mount path of the service's persistent disk. The directory is created on
demand; migrations run in a transaction and roll back as a unit.

`DOCS_MIGRATIONS` is exported so a consumer can inspect (never edit) the docs
schema. Its single-active-spec invariant is a partial unique index —
`CREATE UNIQUE INDEX … ON spec_versions (active) WHERE active = 1` — so the
database rejects a second active row even if application code forgets to.

### Docs engine (v0.2.0)

Off unless `docs.enabled` is true. On, it adds a public documentation surface
backed by SQLite, plus an editor behind the control token.

**Entities**

```ts
interface SpecVersion {
  id: string;                    // uuid
  label: string;                 // unique, human-chosen: 'baseline', '2026-08-breaking'
  spec: OpenApiDocument;
  createdAt: string;             // ISO-8601
  publishedAt: string | null;    // null while a draft
  active: boolean;               // exactly one row may be true
}
interface Guide { slug; title; markdown; published; order; updatedAt }
interface ChangelogEntry { id; date /* YYYY-MM-DD */; title; markdown; published; updatedAt }
```

**Lifecycle rules**

- A version is created as a **draft**: invisible on `/docs` and on
  `/openapi.json`.
- **Publishing** stamps `publishedAt = now` and makes the version active,
  deactivating whatever was active. Republishing an older version re-stamps
  `publishedAt`: what `/openapi.json` serves has changed as of now, and
  `Last-Modified` must move or conditional-GET clients never re-fetch.
- A **published version is immutable**. `updateSpecVersion` on one throws 409 —
  the platform's spec-diff pipeline relies on published specs not changing
  underneath it. Draft from it instead.
- The **active version cannot be deleted**.
- Unpublished guides and changelog entries 404 on the public surface but are
  fully visible and editable through `/__control/docs/*`.

**`GET /openapi.json` with docs enabled** serves the active published version:
strong `ETag` (sha256 of the served body, first 32 hex chars, quoted),
`Last-Modified` = the publish time, `Cache-Control: public, max-age=60`. It
answers `If-None-Match` **and** `If-Modified-Since`, and `If-None-Match` wins
when both are sent (RFC 9110 §13.1.3). `HEAD` works — the platform HEAD-probes
specs. `/__control` paths are stripped from published versions just as they are
from `config.openapi`. With no published version it falls back to
`config.openapi`.

**Deterministic rendering.** `/docs`, `/docs/guides/:slug` and
`/docs/changelog` are server-rendered from markdown and are **byte-identical
for identical content** — no render timestamps, no build hashes, no generated
ids, no database ids in the markup. The platform normalises these pages to text
and hashes them to detect documentation changes, so any per-render variation
would register as a phantom upstream change. The renderer is hand-rolled
(`src/docs/markdown.ts`) rather than a dependency precisely so that guarantee
cannot be broken by someone else's patch release. `test/docs.spec.ts` renders
every page twice, and renders it again from a second independently-seeded
service, comparing bytes each time.

The markdown subset: ATX headings, paragraphs, fenced/indented code,
blockquotes, nested ordered/unordered lists, horizontal rules, pipe tables, and
inline `code` / `**bold**` / `*italic*` / `[link](href)` / `![img](src)` /
`<autolink>`. Raw HTML is escaped, never passed through; `javascript:` and
`data:` link targets are rewritten to `#`.

**Docs auth.** `docs.authMode: 'required'` runs every docs route through the
consumer's `docsAuthCheck(req) => boolean`. sim-core has no opinion about the
credential scheme — sim-pebblepay switches between bearer, basic and a custom
header and needs to fail all of them on demand for `credential-expiry`
scenarios. A check that throws counts as a failed check. `/health` and
`/openapi.json` stay public regardless: the platform polls them unauthenticated.

**Chaos.** `/docs` and `/openapi.json` are chaos-exempt by default. Set
`docsChaosOptIn: true` to make them chaos-eligible; `/__control`, `/__admin`,
`/health` and `/admin` are exempt unconditionally, so the kill switch always
survives.

**Service API** (`app.get(DocsService)`):

```ts
class DocsService {
  activeSpec(): ServedSpec;                                  // cached body + validators
  refreshServedSpec(): ServedSpec;

  listSpecVersions(): SpecVersionSummary[];
  getSpecVersion(id: string): SpecVersion;                   // throws 404
  createSpecVersion(input: { label; spec; publish? }): SpecVersion;
  draftFromActive(label: string): SpecVersion;
  updateSpecVersion(id: string, patch: { label?; spec? }): SpecVersion;   // drafts only
  publishSpecVersion(id: string): SpecVersion;
  publishSpecVersionByLabel(label: string): SpecVersion;     // how a preset scenario publishes
  deleteSpecVersion(id: string): void;

  listGuides(onlyPublished?: boolean): Guide[];
  getGuide(slug: string): Guide;
  upsertGuide(input: GuideInput): Guide;
  deleteGuide(slug: string): void;

  listChangelog(onlyPublished?: boolean): ChangelogEntry[];
  upsertChangelogEntry(input: ChangelogEntryInput): ChangelogEntry;
  deleteChangelogEntry(id: string): void;

  resetDocs(): SeedResult;                                   // wipe + reseed from content/
  lastSeed(): SeedResult | null;
  renderIndex(): string;
  renderGuide(slug: string): { html: string; found: boolean };
  renderChangelog(): string;
  status(): DocsStatus;
  readonly repo: DocsRepository;                             // escape hatch
}
```

Also exported: `DocsRepository`, `DOCS_MIGRATIONS`, `DocsController`,
`DocsControlController`, `DocsAuthGuard`, `contentEtag`, the renderers
(`renderDocsIndex`, `renderGuidePage`, `renderChangelogPage`,
`renderNotFoundPage`), `renderMarkdown`, `renderInline`, `escapeHtml`,
`parseFrontmatter`, `readString` / `readBoolean` / `readNumber`, `loadContent`,
`seedFromContent`, `slugify`, the DTO parsers, and `ACTIVE_SPEC_SOURCE` /
`ActiveSpecSource` (the token `OpenApiController` uses to reach the docs engine
without importing it).

#### `content/` — the seeding format

Baseline documentation is checked into the **consumer's** repo and seeded into
the database on first boot (when all three docs tables are empty), and again on
every `POST /__control/reset-docs`. The database is disposable; `content/` is
the source of truth.

```
content/
  docs.json                 optional manifest
  specs/
    baseline.json           an OpenAPI document; the FILENAME is the label
    additive.json
    breaking.json
  guides/
    getting-started.md      frontmatter + markdown
    charges-lifecycle.md
  changelog/
    2026-07-01-launch.md
    2026-07-15-additive.md
```

`content/docs.json` — every field optional:

```json
{
  "activeSpec": "baseline",
  "guides": ["getting-started", "charges-lifecycle"]
}
```

| Directory | Rules |
|---|---|
| `specs/*.json` | Must be a real OpenAPI document (`openapi` + `info`), or it is skipped with a warning. The label is the filename without `.json`. Exactly one is published + activated: `docs.json.activeSpec` if it names a real file, else the single file if there is only one, else the alphabetically first (with a warning). Every other spec is seeded as a **draft**. |
| `guides/*.md` | Frontmatter `title` (default: filename), `slug` (default: slugified filename), `published` (default **true**), `order` (default: sorts last). Manifest `guides` order wins over frontmatter `order`. |
| `changelog/*.md` | Frontmatter `date` **required** as `YYYY-MM-DD`, or a `YYYY-MM-DD-` filename prefix supplies it; an entry with neither is skipped with a warning. `title` (default: the rest of the filename), `id` (default: slugified filename), `published` (default **true**). |

Frontmatter is a YAML *subset*: `key: value` scalars between `---` fences —
quoted or bare strings, numbers, `true`/`false`. No nesting, no lists, no
multi-line scalars. Deliberately small enough to eyeball.

```md
---
title: Charges lifecycle
order: 2
published: true
---

A charge moves through `pending` → `succeeded` or `failed`.
```

A missing `content/` directory is not an error — docs simply start empty and
`/openapi.json` serves `config.openapi`. See
[`examples/demo/content`](./examples/demo/content) for a working set.

### Webhooks (v0.2.0)

```ts
const DEFAULT_WEBHOOK_SIGNATURE_HEADER = 'x-partner-api-signature';

function verifyPlatformWebhook(rawBody: Buffer, signatureHeader: string, secret: string): boolean;
function signPlatformWebhook(rawBody: Buffer, secret: string): string;   // 'sha256=<hex>'
function extractRawBody(req: Request): Buffer | null;
function inspectWebhookRequest(req: Request, options: WebhookVerificationOptions): WebhookVerification;
function assertPlatformWebhook(req: Request, options: WebhookVerificationOptions):
  { rawBody: Buffer; body: unknown };                        // throws 401

interface WebhookVerificationOptions { secret: string; signatureHeader?: string }
interface WebhookVerification {
  verified: boolean;
  rawBody: Buffer | null;
  signature: string | null;
  reason: 'ok' | 'no-raw-body' | 'missing-signature' | 'bad-signature' | 'no-secret';
}
```

`verifyPlatformWebhook` computes a lowercase-hex HMAC-SHA256 over the **raw
body bytes** and compares with `timingSafeEqual`. It accepts `sha256=<hex>` or
a bare `<hex>` header, case-insensitively. It **never throws**: a
length-mismatched, non-hex, empty or absent signature returns `false`. That
length guard is the point — `timingSafeEqual` throws on unequal-length buffers,
so without it a malformed header would be a 500 instead of a 401.

#### Receiver recipe

**1. Create the app with `rawBody: true`.** This is the step that bites.
`JSON.stringify(req.body)` is *not* the byte sequence that was signed — key
order and whitespace differ — so re-serialising fails every check in a way that
looks exactly like a wrong secret.

```ts
void bootstrapSimService(AppModule, config, { rawBody: true });
```

(Under plain `NestFactory.create` it is the same option:
`NestFactory.create(AppModule, { rawBody: true })`. `assertPlatformWebhook`
returns `reason: 'no-raw-body'` when it is missing, so the failure names
itself.)

**2. Verify first, record, respond fast.** The platform retries slow or non-2xx
deliveries, so real work belongs after the response.

```ts
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly recorder: WebhookRecorderService) {}

  @Post('partner-api')
  @HttpCode(200)
  receive(@Req() req: Request): { received: true } {
    let body: unknown;
    try {
      ({ body } = assertPlatformWebhook(req, { secret: process.env.WEBHOOK_SECRET! }));
    } catch (error) {
      this.recorder.record({ path: '/webhooks/partner-api', verified: false, status: 401 });
      throw error;                                    // -> 401
    }
    this.recorder.record({ path: '/webhooks/partner-api', verified: true, body });
    return { received: true };
  }
}
```

`WebhookRecorderService` is provided by `SimCoreModule` on every service — just
inject it. A complete, tested receiver lives in
[`examples/demo/webhooks.controller.ts`](./examples/demo/webhooks.controller.ts).

```ts
const WEBHOOK_RECORDER_CAPACITY = 50;   // override with config.webhookHistorySize

interface RecordedWebhook {
  seq: number; at: string;              // ISO-8601
  path: string; event: string | null;   // event sniffed from event / type / event_type
  verified: boolean; status: number; body: unknown;   // body truncated past 4000 chars
}

class WebhookRecorderService {
  readonly capacity: number;
  record(input: RecordWebhookInput): RecordedWebhook;
  list(limit?: number): RecordedWebhook[];   // newest first
  size(): number;
  clear(): void;
}
```

Record rejected deliveries too — "did it even arrive?" is the first question
asked when a signature mismatch is being debugged.

### Admin auth (v0.3.0; `/__control` acceptance added in v0.4.0)

```ts
class AdminAuthService {
  isEnabled(): boolean;
  get settings(): ResolvedAdminAuthConfig;      // throws when disabled
  authenticate(req: Request, now?: number): AdminSession | null;
  buildAuthorizationUrl(req: Request, now?: number): string;
  handleCallback(req: Request, now?: number): Promise<CallbackSuccess | CallbackFailure>;
  issueSession(email: string, now?: number): AdminSession;
  serializeSession(session: AdminSession): string;
  setCookieHeader(req: Request, session: AdminSession): string;
  clearCookieHeader(req: Request): string;
  authorizeClaims(claims: IdTokenClaims): string;   // throws AdminAuthError
  redirectUri(req: Request): string;
}

// building blocks, usable on their own
function resolveAdminAuthConfig(raw?: AdminAuthConfig): ResolvedAdminAuthConfig | null;
function verifyGoogleIdToken(idToken: string, opts: VerifyIdTokenOptions): Promise<IdTokenClaims>;
function decodeJwt(token: string): { header; claims; signingInput; signature };
function isAdminGatedPath(path: string): boolean;
function parseCookieHeader(header?: string): Record<string, string>;
function renderAccessDeniedPage(model: AdminAuthPageModel): string;
function renderSignedOutPage(model: AdminAuthPageModel): string;
class GoogleJwksCache { getKey(kid: string): Promise<KeyObject>; size(): number }
class AdminAuthError extends Error { reason: AdminAuthFailure }
```

Turning it on is four lines plus the env:

```ts
const config: SimCoreConfig = {
  // …everything you already had…
  adminAuth: {
    enabled: process.env.ADMIN_AUTH_ENABLED === 'true',
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    allowedDomain: process.env.ADMIN_ALLOWED_DOMAIN ?? 'partnerapi.com',
    sessionSecret: process.env.ADMIN_SESSION_SECRET ?? '',
  },
};
```

See `examples/demo/main.ts` for the same wiring with the optional variables
(`ADMIN_ALLOWED_EMAILS`, `ADMIN_SESSION_TTL_HOURS`) included.

#### The flow

1. An unauthenticated `GET /admin…` gets **302** to Google's authorization
   endpoint with `response_type=code`, `scope=openid email profile`,
   `hd=<allowedDomain>` (a hint, nothing more), a fresh `nonce`, and a `state`.
2. `state` is an HMAC-signed `{nonce, issuedAt, returnTo}` valid for 10 minutes,
   **and** the nonce is recorded server-side and deleted on use. The signature
   stops tampering, the timestamp stops replay-after-expiry, and the
   server-side record stops replay *inside* the window — a signed-but-stateless
   state is reusable for its whole validity period.
3. The callback exchanges the code **server-side** (this is the only place
   `googleClientSecret` is used) and verifies the returned `id_token`:
   RS256 signature against Google's JWKS (cached by `kid`), `iss` ∈
   `{accounts.google.com, https://accounts.google.com}`, `aud === clientId`,
   `exp`/`iat` within a 120s skew, and `nonce` matching the one this round trip
   started with.
4. Only then are the claims authorised: `hd === allowedDomain` **and** `email`
   ends with `@allowedDomain` **and** `email_verified`, plus membership of
   `allowedEmails` when it is set.
5. Success sets the session cookie and 302s back to the originally requested
   `/admin…` path. Failure — any failure — renders one identical 403 page.

#### Session cookie

```
sim_admin_session = base64url(JSON {email, exp}) "." base64url(HMAC-SHA256(payload))
                    ; Path=/admin ; HttpOnly ; SameSite=Lax ; Max-Age=<ttl> [; Secure]
```

- The payload is exactly `{ email, exp }` — no id_token passthrough, no roles,
  no access token. `test/admin-auth.spec.ts` asserts the key set.
- The HMAC key is **derived** from `sessionSecret`
  (`HMAC(secret, "sim-core.admin-auth.session")`), and the `state` uses a
  different derivation. Signing both with the same key would let a value minted
  for one purpose be presented as the other.
- **`Secure` is derived from the request** — `req.secure` (which needs
  `trust proxy`, and `bootstrapSimService` sets it) or `X-Forwarded-Proto`.
  Render terminates TLS, so the app sees plain HTTP and a hardcoded `Secure`
  would break local dev with an invisible redirect loop, while hardcoding it
  off would put the session cookie on the wire in production.
- Authorisation is **re-checked on every request**, not trusted from issue
  time. Narrowing `allowedDomain` or `allowedEmails` and redeploying logs the
  removed people out immediately instead of at the end of their 12 hours.
- `GET /admin/auth/logout` clears the cookie and renders a signed-out page. It
  is a client-side clear, not server-side revocation — there is no session
  store, by design. To evict someone before their TTL, rotate `sessionSecret`.

#### Security notes worth knowing

- **The gate is middleware, not a guard.** `ServeStaticModule` registers plain
  Express middleware in `onModuleInit`, with no controller — and therefore no
  guard — in front of it. A `@UseGuards` would leave `/admin/index.html` and
  `/admin/assets/*` wide open. Nest's own ordering (`registerRouter()` →
  middleware, then `callInitHook()` → serve-static) is what puts the gate
  first, and a test asserts that an **asset** 302s so the ordering cannot
  silently regress.
- **`hd` alone is not enough.** Both `hd` and the email suffix are required.
  They normally agree, but they are different assertions and requiring both
  means one surprising claim shape cannot let an outsider in.
- **The 403 page never says why.** Wrong domain, unverified address, not on the
  allowlist, forged signature — all render the same bytes. The reason is logged
  server-side as a `SimCore:adminAuth` warning.
- **The JWKS fetch is injectable** (`adminAuth.fetchImpl`, exactly like
  `driver.fetchImpl`), so the suite and offline dev never reach
  `googleapis.com`. An unknown `kid` triggers at most one refetch per minute,
  so a stream of junk tokens cannot turn a sim service into a load generator
  pointed at Google.
- **Use a different `sessionSecret` per service.** A shared one makes a session
  cookie minted by one sim valid on another.

#### Creating the Google OAuth client (operator note)

One OAuth client covers the whole fleet.

1. Google Cloud console → **APIs & Services → Credentials → Create credentials
   → OAuth client ID**, application type **Web application**.
2. Under **Authorized redirect URIs**, add one entry per deployed service plus
   one for local dev. The fleet runs on `partnerapi.cloud` (Render):

   ```
   https://staybase.partnerapi.cloud/admin/auth/callback
   https://bookbridge.partnerapi.cloud/admin/auth/callback
   https://pebblepay.partnerapi.cloud/admin/auth/callback
   http://localhost:3000/admin/auth/callback
   ```

   Google matches these **exactly** — scheme, host, port and path, no trailing
   slash, no wildcards. A service reached on a different hostname (an
   `onrender.com` default domain, a preview URL, a custom port) needs its own
   entry or sign-in fails with `redirect_uri_mismatch`. If a service runs on a
   non-3000 local port, add that port too; `bootstrapSimService` builds the
   redirect URI from the request's host, or from `adminAuth.publicBaseUrl` when
   you set it.
3. **Authorized JavaScript origins** can be left empty — this is a server-side
   authorization-code flow, not an implicit one.
4. Copy the client id and secret into `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` on each Render service (`sync: false`), and give each
   service its **own** `ADMIN_SESSION_SECRET`.
5. Nothing needs to be done in the Workspace admin console: the `hd` claim on a
   Workspace account is enough, and it is the account's own domain that is
   checked.

### Conditional requests (v0.2.0)

```ts
function httpDate(input: number | Date): string;              // IMF-fixdate
function toHttpSeconds(input: number | Date): number;         // one-second resolution
function isNotModified(req: Request, target: ConditionalTarget): boolean;

interface ConditionalTarget { etag: string; lastModified: number | Date }
```

`If-None-Match` takes precedence when both validators are present; `*` matches
anything; weak-tag prefixes are stripped before comparison; an unparseable
`If-Modified-Since` is ignored rather than treated as a match.

### Other exports

`ControlService`, `ControlController`, `ControlAuthGuard`, `ControlState`,
`DriverOverrideState`, `TTL_MIN_SECONDS` (1), `TTL_MAX_SECONDS` (86400),
`parseActivateScenarioBody`, `parseDriverOverrideBody`, `ActivateScenarioBody`,
`DriverOverrideBody`, `HealthController`, `HealthPayload`, `OpenApiController`,
`stripControlPaths`, `AdminBrandController`, `AdminBrandPayload`,
`resolveAdminDist`, and — new in v0.2.0 — `DOCS_CHAOS_PREFIXES` and
`ChaosExemptionOptions` (`isChaosExempt(path, { docsChaosOptIn })`; the
single-argument form from v0.1.0 still works).

---

## Routes mounted by the module

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | `{ status: 'ok', uptime: number, version: string }` |
| GET/HEAD | `/openapi.json` | none | `ETag`, `Last-Modified`, `Cache-Control`; 304 on `If-None-Match` or `If-Modified-Since`; `/__control` paths stripped. Serves the active published spec version when docs are enabled, else `config.openapi` |
| GET | `/admin/*` | **`adminAuth` when enabled**, else none (SPA asks for the control token) | static SPA, only when `admin !== false` and `dist/public` exists |
| GET | `/admin/auth/callback` | none (validates `state` + `code`) | **v0.3.0, adminAuth only.** OAuth redirect target. 302 + session cookie on success, 403 page otherwise. Path configurable via `callbackPath` |
| GET | `/admin/auth/logout` | none | **v0.3.0, adminAuth only.** Clears the session cookie, renders a signed-out page. **200** |
| GET | `/__admin/brand` | none | display-only `{ name, version, brand, driver, docs, adminAuth }` for the SPA shell |
| GET | `/docs` | `docs.authMode` | **docs only.** Index: active spec label, published guides, changelog link |
| GET | `/docs/guides/:slug` | `docs.authMode` | **docs only.** 404 (HTML) for a missing or unpublished slug |
| GET | `/docs/reference` | `docs.authMode` | **docs only.** Rendered API reference (Scalar, loaded from a CDN) over the active `/openapi.json` |
| GET | `/docs/changelog` | `docs.authMode` | **docs only.** Published entries, newest first |
| — | `/__control/*` | **bearer** | see below |

### `__control` contract

Every route requires `Authorization: Bearer ${CONTROL_TOKEN}`; anything else is
**401** (wrong token, wrong scheme, or no header). These routes are excluded
from `/openapi.json`.

| Method / path | Body | Behaviour |
|---|---|---|
| `GET /__control/state` | — | active scenario + TTL remaining, chaos rules, driver status + override, baseline summary, request-tail size, available scenario ids |
| `GET /__control/scenarios` | — | `{ scenarios: [{ id, description, params, admin }] }` — `params` is the described schema or `null`; `admin` (v0.5.0) is the scenario's `ScenarioAdminMeta` or `null` |
| `GET /__control/actions` | — | **v0.5.0.** `{ actions: AdminAction[] }` — the consumer's declared `adminActions`, `[]` when none |
| `GET /__control/requests?limit=` | — | `{ requests: RequestTailEntry[] }`, newest first, default limit 50 (**addition to the spec table** — the admin SPA's request tail reads it) |
| `POST /__control/scenario` | `{ scenario, params?, ttlSeconds }` | activate; **`ttlSeconds` required, 1..86400**; auto-reverts at expiry; replaces any active scenario. Returns the new state |
| `POST /__control/driver` | `{ mode, multiplier?, ttlSeconds }` | driver override, same TTL rules. `mode` ∈ `baseline` \| `burst` \| `paused`; `multiplier` 1..100 and only meaningful for `burst`. Returns the new state |
| `POST /__control/reset` | — | revert chaos + scenario + driver override to baseline immediately. Returns the new state |
| `GET /__control/webhooks?limit=` | — | **v0.2.0.** `{ capacity, size, webhooks: RecordedWebhook[] }`, newest first. Always available |
| `POST /__control/reset-docs` | — | **v0.2.0.** Wipe the docs tables and reseed from `content/`. Returns `SeedResult`. **200**, not 201. 404 when docs are disabled |

**Docs editor routes** (v0.2.0, same bearer token, registered only when
`docs.enabled` — a docs-disabled service 404s all of them, which is how the
admin SPA decides whether to show its Docs tab). Unlike `/docs`, these expose
drafts and unpublished content:

| Method / path | Body | Behaviour |
|---|---|---|
| `GET /__control/docs` | — | `DocsStatus`: auth mode, database file, content dir, chaos opt-in, counts, active spec, applied migrations |
| `GET /__control/docs/spec-versions` | — | `{ specVersions: SpecVersionSummary[] }` — drafts included, no spec bodies |
| `GET /__control/docs/spec-versions/:id` | — | full `SpecVersion` including the spec |
| `POST /__control/docs/spec-versions` | `{ label, spec?, fromActive?, publish? }` | create a draft. `spec` may be an object **or a JSON string** (400 with the parse error otherwise). Omit `spec` to copy the active version |
| `PATCH /__control/docs/spec-versions/:id` | `{ label?, spec? }` | edit a **draft**. 409 on a published version |
| `POST /__control/docs/spec-versions/:id/publish` | — | make it the active published version |
| `DELETE /__control/docs/spec-versions/:id` | — | 409 on the active version. **200** |
| `GET /__control/docs/guides` | — | `{ guides: Guide[] }`, drafts included |
| `GET /__control/docs/guides/:slug` | — | one `Guide` |
| `PUT /__control/docs/guides/:slug` | `{ title, markdown, published, order? }` | upsert. **200** |
| `POST /__control/docs/guides` | `{ slug, title, markdown, published, order? }` | create |
| `DELETE /__control/docs/guides/:slug` | — | **200**, 404 if unknown |
| `GET /__control/docs/changelog` | — | `{ changelog: ChangelogEntry[] }`, drafts included |
| `POST /__control/docs/changelog` | `{ date, title, markdown, published, id? }` | create |
| `PUT /__control/docs/changelog/:id` | `{ date, title, markdown, published }` | upsert. **200** |
| `DELETE /__control/docs/changelog/:id` | — | **200**, 404 if unknown |
| `POST /__control/docs/preview` | `{ markdown }` | `{ html }` from the **same renderer the public pages use**, so the editor preview cannot drift from what gets published. **200** |

Status codes: `201` on the POST routes (Nest default), `400` validation
(`{ error: 'validation_failed', errors: { field: message } }` or
`{ error: 'invalid_scenario_params' }`), `401` auth, `404` unknown scenario
(`{ error: 'unknown_scenario', available: [...] }`), `409` driver override on a
service with no driver (`{ error: 'driver_not_configured' }`).

Docs-route status codes: `404` `unknown_spec_version` / `unknown_guide` /
`unknown_changelog_entry` / `docs_disabled`; `409` `spec_version_published`
(editing published history), `spec_version_active` (deleting the live version),
`spec_label_taken`; `401` `docs_unauthorized` / `docs_auth_not_configured`.

`GET /__control/state` shape:

```jsonc
{
  "service":  { "name", "brand", "version", "startedAt", "uptimeSeconds" },
  "scenario": null,                       // or ActiveScenarioState
  "chaos":    { "baseline": true, "rules": [] },
  "driver":   { "configured", "running", "mode", "multiplier", "defaultMode",
                "baselineRequestsPerMinute", "maxRequestsPerMinute",
                "effectiveRequestsPerMinute", "requestsLastMinute", "capHits",
                "totalRequests", "totalFailures", "seed", "lastRequestAt",
                "currentFlow", "flows", "requestMutators", "override": null },
  "baseline": { "chaos": true, "driver": true, "overall": true },
  "requestTail": { "size": 0, "capacity": 200 },
  "scenariosAvailable": ["auth-failure", "error-spike", "latency", "outage"]
}
```

Example:

```bash
curl -s -H "Authorization: Bearer $CONTROL_TOKEN" localhost:3000/__control/state | jq
curl -s -X POST -H "Authorization: Bearer $CONTROL_TOKEN" -H 'content-type: application/json' \
  -d '{"scenario":"latency","params":{"baseMs":900,"jitterMs":300},"ttlSeconds":600}' \
  localhost:3000/__control/scenario
curl -s -X POST -H "Authorization: Bearer $CONTROL_TOKEN" localhost:3000/__control/reset
```

---

## Admin SPA (`/admin`)

Vite + React, built into `dist/public` at package build time and served
statically by the Nest app.

**Control tab** (redesigned in v0.5.0, top to bottom)

- **Status** — at baseline, or what is running and when it reverts (a live
  countdown), plus traffic facts: for a driver sim its target rate, requests
  in the last minute, failures and last send; for a receive-only sim the
  requests received in the last minute, the 4xx/5xx share and the last request
  (admin and health-check traffic excluded). **Stop and reset to baseline**
  lives here.
- **Scenarios** — a runbook grouped by `admin.group`, each with its title,
  description, "Triggers" (the Partner API automation it should set off), a
  duration picker (1 min – 24 h, or custom seconds) and **Run**. Parameters
  keep their defaults under a collapsed **Options**. Permanent scenarios
  (`admin.durable`) say so, show their undo and always confirm; starting a
  scenario while another runs asks before replacing it.
- **Manual controls** — the traffic driver override (burst/pause/baseline,
  multiplier, duration) and one control per `adminActions` entry.
- **Activity** — requests received (admin/health traffic hidden unless asked
  for) and webhooks received, with their bodies.
- **Advanced** (collapsed) — driver counters, per-flow stats, fault rules and
  the full state JSON.
- **Danger zone** — **Reset docs from content/** (docs-enabled sims only),
  confirmed.
- control-token entry, kept in `localStorage`, sent as a bearer token; state
  polled every 5s.

**Docs tab** (v0.2.0 — only shown when `/__admin/brand` reports `docs: true`)

- **Spec versions**: list with `active` / `draft` / `published` badges; create a
  draft from the active version or from scratch; edit the JSON in a textarea
  that parses on every keystroke and blocks Save while it is invalid; publish;
  delete. Published versions render read-only, because they are immutable.
- **Guides** and **Changelog**: markdown editors with title, ordering (guides)
  or date (changelog), a published toggle, and a **Preview** button that renders
  through `POST /__control/docs/preview` — the same server-side renderer the
  public pages use, so the preview cannot lie.
- **Reset docs…**, behind a confirmation, and a link to the public docs.
  Publishing a spec version and deleting anything are confirmed too (v0.5.0).

Themed with `brand.color`; light and dark. Set `admin: false` in the config to
skip serving it.

**One tier for humans, when `adminAuth` is on (v0.4.0+).** Signing in with
Google is sufficient to operate the console — `ControlAuthGuard` accepts the
`adminAuth` session cookie as an alternative to `CONTROL_TOKEN`, not a
replacement for it, so nothing pasted, nothing to find in a dashboard. There
is no longer a separate "can view" vs. "can mutate" tier: anyone who can sign
in can activate a scenario, publish a spec version, or reset the service.
`CONTROL_TOKEN` keeps working unmodified for everything that isn't a browser —
scripts, CI, curl, the eventual agent pipeline — none of which can carry a
cookie. The header shows **Sign out** when the gate is on (ends the Google
session via `/admin/auth/logout`) and **Forget token** only when a real token
is stored in `localStorage` (a holdover from before `adminAuth` was enabled,
or from a deployment that never turns it on).

CSRF is not a new concern this introduces: every mutating `/__control` route
is POST/PUT/PATCH/DELETE, the cookie is `SameSite=Lax`, and Lax cookies are
withheld from cross-site requests for every method except a top-level *GET*
navigation — which none of these routes accept. A foreign page's `fetch`,
`XHR`, or `<form>` POST to this origin carries no cookie at all.

Widening the gate this way widens the cookie's `Path` too: it is `/`, not
`/admin`, so the browser sends it to `/__control` as well. Nothing else on the
origin reads cookies — the domain API, `/docs`, and the webhook receivers all
use their own bearer, API-key, or signature schemes — so this is inert
everywhere else.

---

## Testing your consumer

Use `bootstrapSimService(AppModule, config, { listen: false, logger: false })`
to build an app for supertest.

> **Caveat.** `ServeStaticModule` resolves its loader while providers are
> created, which under `Test.createTestingModule().compile()` happens *before*
> an HTTP adapter exists — so `/admin` is not served from a TestingModule.
> `@nestjs/testing` works fine for everything else; pass `admin: false` when
> using it. `test/testing-module.spec.ts` demonstrates both paths.

Useful handles: `app.get(ControlService)`, `app.get(ChaosService)`,
`app.get(DriverService)`, `app.get(RequestTailService)`,
`app.get(WebhookRecorderService)`, and `app.get(DocsService)` when docs are on.

For driver tests, pass `driver.fetchImpl` to record requests without a network,
and call `driver.tick(now)` directly instead of running the scheduled loop.

**Docs tests.** Use `docs.databaseFile: ':memory:'` for a fresh, isolated
database per app — no temp files, no cleanup, and seeding still runs from a
real `content/` directory so the format is exercised. Point `docs.contentDir`
at a fixture when you want to test a specific shape. When you need to prove
durability instead of isolation, pass a `docs.dataDir` under `os.tmpdir()` and
build the app twice.

**Webhook tests.** Create the app with `{ rawBody: true }` and sign fixtures
with `signPlatformWebhook(Buffer.from(JSON.stringify(payload)), secret)` —
signing the same bytes you send is the whole trick, and the exported helper
means each consumer is not reimplementing it (and its off-by-one bugs).

---

## Deploying a consumer to Render

sim-core does not ship a `render.yaml` — each company repo owns its own — but
every one of them looks like this. The only real decision is whether the
service needs a disk, and that is decided entirely by whether it enables docs.

**Docs-enabled service** (sim-pebblepay, sim-staybase) — needs a persistent
disk, and `DATA_DIR` must be the mount path:

```yaml
services:
  - type: web
    name: sim-pebblepay
    runtime: node
    plan: starter               # a disk requires a paid plan
    buildCommand: pnpm install --frozen-lockfile && pnpm build
    startCommand: node dist/main.js
    healthCheckPath: /health
    disk:
      name: pebblepay-data
      mountPath: /var/data      # must equal DATA_DIR
      sizeGB: 1
    envVars:
      - key: DATA_DIR
        value: /var/data
      - key: CONTROL_TOKEN
        generateValue: true     # or sync: false to paste one in
      - key: WEBHOOK_SECRET
        sync: false             # comes from the platform at registration time
      # --- v0.3.0 admin gate, optional ---
      - key: ADMIN_AUTH_ENABLED
        value: "true"
      - key: GOOGLE_CLIENT_ID
        sync: false             # one OAuth client for the whole fleet
      - key: GOOGLE_CLIENT_SECRET
        sync: false
      - key: ADMIN_ALLOWED_DOMAIN
        value: partnerapi.com
      - key: ADMIN_SESSION_SECRET
        generateValue: true     # per service — never shared between them
```

**Docs-disabled service** (sim-bookbridge) — no disk, no `DATA_DIR`; state is
in memory by design and a restart is supposed to clear it.

Two things worth knowing before the setup session:

- **A disk costs zero-downtime deploys.** Render cannot run two instances
  against one disk, so a disk-bearing service redeploys with a gap. That is an
  accepted trade for the sim fleet — see "Decisions locked" in the fleet spec —
  but it is why only the services that genuinely need durable docs get one.
- **`content/` is the real source of truth, the disk is a cache.** If a disk is
  ever lost or resized, `POST /__control/reset-docs` rebuilds the whole docs
  database from the repo. Nothing that matters lives only on the disk.

---

## Development

```bash
pnpm install
pnpm build          # tsc -> dist, vite -> dist/public   (commit the result)
pnpm lint
pnpm typecheck
pnpm test
pnpm verify         # all three
pnpm example        # runs examples/demo on :3000 with docs enabled
DOCS=0 pnpm example # ...and without, to see the v0.1.0-shaped service
```

`dist/` is committed on purpose — see the note in `.gitignore` and the pnpm
caveats above. **Rebuild and commit `dist/` with any change to `src/` or
`admin/`**, or consumers will install stale code.

Environment: see [`.env.example`](./.env.example) — `CONTROL_TOKEN`, `PORT`,
`DATA_DIR`, `WEBHOOK_SECRET`, and the v0.3.0 gate's `ADMIN_AUTH_ENABLED`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_ALLOWED_DOMAIN`,
`ADMIN_SESSION_SECRET` (+ optional `ADMIN_ALLOWED_EMAILS`,
`ADMIN_SESSION_TTL_HOURS`). No secrets are ever committed.

Test layout: `test/backcompat.spec.ts` is the contract with already-deployed
consumers — treat a failure there as "the upgrade is not backward compatible",
not as a test to update. `test/docs.spec.ts` owns the byte-identical rendering
guarantee; a failure there is a real bug, not flake.
`test/admin-auth.spec.ts` runs against a fake Google (`test/google-stub.ts` —
a locally generated RSA keypair serving a stub JWKS and a stub token endpoint,
injected via `adminAuth.fetchImpl`), so the suite never touches the network.
Its "machine surfaces are untouched" block runs with the gate **enabled**; a
failure there means a sim would start 302ing something the platform polls.

### Releasing

```bash
pnpm verify && pnpm build   # ALWAYS build: dist/ is the consumption mechanism
git commit -am "…" && git push
git tag -a v0.3.0 -m "…" && git push origin v0.3.0
```

Consumers then bump their `github:okjake/sim-core#v0.3.0` ref. Tags are
annotated; the lockfile pins the tag object's SHA, which is still immutable.
