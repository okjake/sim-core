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
`/__control`, `/health`, `/openapi.json` or `/admin`, so the kill switch stays
reachable during an outage scenario.

---

## Install

sim-core is consumed as a pinned git dependency. Add to the consumer's
`package.json`:

```json
{
  "dependencies": {
    "sim-core": "github:okjake/sim-core#v0.1.0"
  }
}
```

Then `pnpm install`.

### pnpm caveats (verified, not guessed)

- **`dist/` is committed.** pnpm only builds a git dependency if it declares a
  `prepare` script; sim-core deliberately has none, so pnpm just unpacks the
  repo and the prebuilt library + admin SPA are there immediately. This is the
  reliable option — a `prepare`-based build would need devDependencies
  (TypeScript, Vite, React) installed inside every consumer's store on every
  install, and is skipped entirely under `--ignore-scripts` / restricted CI.
- **Pin a tag, not a branch.** `#v0.1.0` resolves to an immutable commit.
  `github:okjake/sim-core` (no ref) tracks the default branch and will drift.
- Peer dependencies are **not** bundled. The consumer must already depend on
  `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`,
  `reflect-metadata` and `rxjs` (all ^11 / ^0.2 / ^7 respectively). pnpm's
  strict node_modules means a missing peer is a hard failure at import time,
  not a subtle one.
- sim-core brings exactly one runtime dependency of its own:
  `@nestjs/serve-static` (for `/admin`).
- Bumping the tag: change the ref, then `pnpm install`. pnpm caches git deps by
  resolved commit, so a moved tag needs `pnpm store prune` or a fresh ref.
- **The repo is private, so the install needs git credentials.** pnpm probes
  for SSH access and, when it finds it, rewrites `github:okjake/sim-core#v0.1.0`
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
import { p, type SimCoreConfig } from 'sim-core';
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
import { SimCoreModule } from 'sim-core';

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
import { bootstrapSimService } from 'sim-core';

import { AppModule } from './app.module';
import { config } from './config';

void bootstrapSimService(AppModule, config);
```

A complete working service lives in [`examples/demo`](./examples/demo) — a
dummy domain controller, a custom driver-level scenario, and the config that
ties them together. The test suite runs against it.

---

## Public API surface

Everything below is exported from the package root (`import { … } from 'sim-core'`).

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
`maxRequestsPerMinute` that is not `> 0`.

### Scenarios

```ts
type RevertFn = () => void | Promise<void>;

interface Scenario<P = any> {
  id: string;
  description: string;
  params?: ParamSchema<P>;                       // optional; see "Params" below
  apply(ctx: ScenarioContext, params: P): RevertFn | Promise<RevertFn>;
}

interface ScenarioContext {
  chaos: ChaosControl;
  driver: DriverControl;
  rng: Rng;                                      // seeded from config.seed + scenario id
  logger: Logger;                                // @nestjs/common Logger
  service: { name: string; brand: SimBrand };
}

interface ScenarioListing { id: string; description: string; params: unknown | null }

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
import { p } from 'sim-core';

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

### Other exports

`ControlService`, `ControlController`, `ControlAuthGuard`, `ControlState`,
`DriverOverrideState`, `TTL_MIN_SECONDS` (1), `TTL_MAX_SECONDS` (86400),
`parseActivateScenarioBody`, `parseDriverOverrideBody`, `ActivateScenarioBody`,
`DriverOverrideBody`, `HealthController`, `HealthPayload`, `OpenApiController`,
`stripControlPaths`, `AdminBrandController`, `AdminBrandPayload`,
`resolveAdminDist`.

---

## Routes mounted by the module

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | `{ status: 'ok', uptime: number, version: string }` |
| GET | `/openapi.json` | none | `ETag`, `Last-Modified`, `Cache-Control`; 304 on `If-None-Match`; `/__control` paths stripped |
| GET | `/admin/*` | none (SPA asks for the token) | static SPA, only when `admin !== false` and `dist/public` exists |
| GET | `/__admin/brand` | none | display-only `{ name, version, brand, driver }` for the SPA shell |
| — | `/__control/*` | **bearer** | see below |

### `__control` contract

Every route requires `Authorization: Bearer ${CONTROL_TOKEN}`; anything else is
**401** (wrong token, wrong scheme, or no header). These routes are excluded
from `/openapi.json`.

| Method / path | Body | Behaviour |
|---|---|---|
| `GET /__control/state` | — | active scenario + TTL remaining, chaos rules, driver status + override, baseline summary, request-tail size, available scenario ids |
| `GET /__control/scenarios` | — | `{ scenarios: [{ id, description, params }] }` — `params` is the described schema or `null` |
| `GET /__control/requests?limit=` | — | `{ requests: RequestTailEntry[] }`, newest first, default limit 50 (**addition to the spec table** — the admin SPA's request tail reads it) |
| `POST /__control/scenario` | `{ scenario, params?, ttlSeconds }` | activate; **`ttlSeconds` required, 1..86400**; auto-reverts at expiry; replaces any active scenario. Returns the new state |
| `POST /__control/driver` | `{ mode, multiplier?, ttlSeconds }` | driver override, same TTL rules. `mode` ∈ `baseline` \| `burst` \| `paused`; `multiplier` 1..100 and only meaningful for `burst`. Returns the new state |
| `POST /__control/reset` | — | revert chaos + scenario + driver override to baseline immediately. Returns the new state |

Status codes: `201` on the POST routes (Nest default), `400` validation
(`{ error: 'validation_failed', errors: { field: message } }` or
`{ error: 'invalid_scenario_params' }`), `401` auth, `404` unknown scenario
(`{ error: 'unknown_scenario', available: [...] }`), `409` driver override on a
service with no driver (`{ error: 'driver_not_configured' }`).

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
statically by the Nest app. Phase-1 scope:

- control-token entry, kept in `localStorage`, sent as a bearer token
- live state panel, polled every 5s
- scenario list + activate form with a required TTL field
- driver controls (mode, multiplier, TTL) and live rate/cap counters
- request tail

Themed with `brand.color`; light and dark. Set `admin: false` in the config to
skip serving it.

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
`app.get(DriverService)`, `app.get(RequestTailService)`.

For driver tests, pass `driver.fetchImpl` to record requests without a network,
and call `driver.tick(now)` directly instead of running the scheduled loop.

---

## Development

```bash
pnpm install
pnpm build          # tsc -> dist, vite -> dist/public   (commit the result)
pnpm lint
pnpm typecheck
pnpm test
pnpm verify         # all three
pnpm example        # runs examples/demo on :3000
```

`dist/` is committed on purpose — see the note in `.gitignore` and the pnpm
caveats above. **Rebuild and commit `dist/` with any change to `src/` or
`admin/`**, or consumers will install stale code.

Environment: see [`.env.example`](./.env.example) — `CONTROL_TOKEN` and `PORT`.
No secrets are ever committed.

### Releasing

```bash
pnpm verify && pnpm build
git commit -am "…" && git push
git tag v0.2.0 && git push origin v0.2.0
```

Consumers then bump their `github:okjake/sim-core#v0.2.0` ref.
