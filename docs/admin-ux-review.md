# `/admin` review and redesign (v0.5.0)

Brief (Jake, 2026-10-09): *make the control UI easier without losing
functionality.* The control UI is `/admin` on each sim. This doc records what
was wrong, the structure that replaced it, and where every old control went.

## Where the UI lives

There is one admin SPA, in this repo (`admin/`), built into `dist/public` and
served by every sim at `/admin`. Staybase, Bookbridge and Pebblepay have no
admin code of their own. They differ only in what they feed the SPA: brand
colour, scenarios, whether a traffic driver exists, and whether the docs engine
is on. So the redesign is made here once. Each sim adopts it by repinning and,
optionally, describing its scenarios and control routes.

Before v0.5.0, each sim also had `/__control/*` routes that the SPA did not
know about:

| Sim | Route | Was reachable from `/admin`? |
|---|---|---|
| sim-core (all sims) | `GET /__control/webhooks` (received-webhook recorder) | no |
| Staybase | `POST /__control/push-metrics` | no |
| Pebblepay | `GET`/`POST /__control/auth-scheme` | no |

## Critique of the old page

The old Control tab was four equal panels: Live state, Activate scenario,
Traffic driver and Request tail. A Docs tab sat beside it when the docs engine
was on.

**Information hierarchy.** The first question an operator has is "what is this
sim doing right now?". The answer was split across Live state ("Active
scenario: —", "Baseline: at baseline") and Traffic driver. Neither said what
traffic the sim was actually handling. "Run scenario X now" sat behind a
`<select>` of raw ids with a description that changed under it. The panel that
told you the most, the request tail, was mostly the page's own noise.

**The request tail measured the admin page.** It showed the last 50 requests,
and the page polls `/__control/state` and `/__control/requests` every five
seconds, besides loading its own assets. On Pebblepay, a quiet sim, the
visible rows were nearly all `/__control/*`, `/admin/*` and `/__admin/brand`.

**Naming and copy.** Form labels were raw identifiers: `ttlSeconds *`,
`multiplier`, `pathPrefix`, `baseMs`. Scenarios were ids only (`error-spike`,
`use-deprecated-v1`). Nothing tied a scenario to what it is *for*, which is
the Partner API automation it exercises. "Rate (effective / cap)" and "Cap
hits" sat beside "Uptime" at equal weight.

**Grouping and density.** Twelve-plus scenarios on Bookbridge, all in one
dropdown with no grouping. The built-in chaos scenarios came first
alphabetically, even on Bookbridge, where they only touch its tiny inbound
API. The real Bookbridge scenarios (expired key, malformed dates, deprecated
v1) were hidden among them. Receive-only sims (Staybase, Pebblepay) spent a
whole panel saying "This service has no traffic driver".

**Dangerous actions.** "Reset to baseline" sat in the header beside "Forget
token", both styled the same, with no indication of current state. In the
Docs tab, deleting a spec version, guide or changelog entry had no
confirmation at all. Publishing a spec version, which the platform's spec
monitor diffs (a breaking publish alerts at once), was one unconfirmed click.
Pebblepay's `publish-spec-version` scenario is permanent: its revert is a
deliberate no-op. The page gave it the same "A TTL is mandatory … reverts
itself" hint as every other scenario. That hint was false for exactly the one
scenario where it mattered.

**Consistency across sims.** The page itself was consistent, because it is
shared. The inconsistency was in what each sim could do from it. Staybase's
metrics push and Pebblepay's auth-scheme switch were curl-only. The webhook
recorder, which exists on every sim to answer "did the delivery arrive?", had
no view at all.

**Smaller things.**
- On mobile the request tail clipped its Status column, which is the one that
  matters.
- Amber Bookbridge buttons with white text fell short of 4.5:1 contrast.
- Activating a scenario silently replaced one already running, possibly
  someone else's.
- `window.confirm` / `window.prompt` styling.

### Per sim

- **Staybase** (receive-only, docs on). Its most important scenario,
  `guest-name-limit-100` (undocumented drift), was one id among five. The
  daily metrics push could only be forced with curl. The tail was dominated
  by admin traffic between Bookbridge bursts.
- **Bookbridge** (driver, no docs). The best-instrumented sim, but its driver
  numbers were split across two panels. Its own scenarios were mixed in with
  four built-ins that do almost nothing on a client. `traffic-burst` and
  `paused` duplicate the driver override with no explanation of the
  difference.
- **Pebblepay** (receive-only, docs required-capable). It carries the fleet's
  only permanent scenario, labelled like a transient one. Its auth-scheme
  switch, a two-sided platform setup step, was curl-only. "Reset from
  content/", the undo for that permanent publish, was in a different tab from
  the publish.

## The new structure

One page, top to bottom, in the order an operator asks:

1. **Status.** The answer is the headline: "At baseline", or "Error storm is
   running · Reverts in 4:12, at 12:13", or "Traffic burst ×3 · Manual
   override, ends in 2:00". The facts below it are real numbers only:
   - driver sims: target rate (with cap), sent last minute, failed, last sent;
   - receive-only sims: received last minute, 4xx/5xx share of recent
     requests, last request, with admin and health traffic excluded;
   - uptime and version.
   **Stop and reset to baseline** is here: red when something is running,
   disabled when there is nothing to stop.
2. **Scenarios** as a runbook, grouped by purpose, the sim's own groups first
   and the generic built-ins last. Each row shows:
   - a human title, plus the id for people who script it;
   - the description;
   - **Triggers**: which Partner API automation it should set off;
   - a duration picker that defaults to 5 min;
   - a one-click **Run**.
   Parameters keep their defaults under a collapsed **Options**, whose summary
   shows any value you changed. The running row is highlighted with its own
   countdown and **Restart**. Permanent scenarios are tagged, show their undo,
   hide the meaningless duration and always confirm. Starting a scenario while
   another runs asks first.
3. **Manual controls**: the traffic override as a segmented control
   (Burst / Pause / Baseline) with multiplier and duration, then one control
   per sim-declared action (Staybase "Push metrics now", Pebblepay "Credential
   scheme" with its current value).
4. **Activity**: requests received, with admin and health traffic hidden by
   default (a checkbox shows them), and **webhooks received**, each expandable
   to its body.
5. **Advanced** (collapsed): every number the old panels showed plus per-flow
   stats, fault rules and the full state JSON.
6. **Danger zone**: **Reset docs from content/**, confirmed, described as the
   undo for a permanent publish. Docs-enabled sims only.

The **Docs** tab keeps its editor. Publishing a spec version and every delete
now confirm, with the consequence spelled out.

### Room for later

Groups are data (`ScenarioAdminMeta.group`). The likely "Partner actor" group
on Bookbridge (tickets, app submissions, onboarding stalls, MCP calls) will
slot in as another runbook section when its scenarios are tagged. Actions that
are not TTL-bounded go in `adminActions`. Neither needs an SPA change.

### How the sims describe themselves

- `Scenario.admin`: `title`, `triggers`, `group`, `durable`, `undo`,
  `defaultTtlSeconds`, `order`. Presentation only; the server never reads it.
- `SimCoreConfig.adminActions`: buttons for routes the sim already registered
  under `/__control/`. Validated at bootstrap so the SPA can never send the
  operator's credential outside the control plane.
- `GET /__control/actions`: additive route the SPA reads, behind the control
  guard.

No route, scenario id, parameter, TTL rule, env var or scheduled job changed.

## Scenario → Partner API automation

As written into each sim's `admin.triggers`:

| Sim | Scenario | Triggers |
|---|---|---|
| sim-core built-ins | `error-spike` (Error storm), `outage` (Full outage), `latency` (Slow responses) | Traffic troubleshooting. `outage` is incident-shaped, but nothing opens a platform incident record |
| sim-core built-ins | `auth-failure` (Reject all credentials) | Traffic troubleshooting (401s), *unverified* |
| Staybase | `guest-name-limit-100` | Undocumented drift: 422s attributed to guestName; traffic troubleshooting |
| Staybase | action `push-metrics` | Integration health; business-review metrics |
| Bookbridge | `expired-api-key`, `malformed-payloads`, `traffic-burst` | Traffic troubleshooting |
| Bookbridge | `use-deprecated-v1` | Deprecated-version signals; integration health |
| Bookbridge | `paused` | none declared |
| Pebblepay | `publish-spec-version` (permanent) | breaking → integration troubleshooting + `integration.breaking_change` webhook to Bookbridge; additive → daily digest only |
| Pebblepay | `credential-expiry` | Integration troubleshooting (credential error) |
| Pebblepay | `degradation` | Staybase checkout 502s; traffic troubleshooting |
| Pebblepay | `async-charge-failures` | none declared (unmapped) |

## Function parity

Every control on the old page, and where it is now.

| Old control | Now |
|---|---|
| Control-token gate (paste, localStorage, bearer) | Unchanged |
| Session mode (Google gate authorizes `/__control`), one-shot 401 recovery, fallback to token gate | Unchanged (same code) |
| Forget token / Sign out | Header, unchanged conditions |
| Reset to baseline | Status header: **Stop and reset to baseline** |
| Live state: baseline pill | Status headline; detail in Advanced |
| Live state: active scenario, reverts in, params | Status headline + countdown; running row in runbook; params in Advanced |
| Live state: chaos rule count | Advanced (plus the rules themselves) |
| Live state: uptime, version | Status facts |
| Activate scenario: select | Runbook row per scenario |
| Activate scenario: description | Row description |
| Activate scenario: every param field, typed, enum selects | Row → Options (same fields, same coercion, plus min/max) |
| Activate scenario: ttlSeconds (1–86400) | Duration picker: presets 1 min – 24 h, or custom seconds 1–86400 |
| Traffic driver: mode / multiplier / ttlSeconds / Apply | Manual controls → Traffic (same values; durations 1 min – 1 h) |
| Traffic driver: mode pill | Traffic tag; status headline when overridden |
| Traffic driver: rate effective / cap | Status "Target rate (cap N)"; Advanced (effective / baseline / cap) |
| Traffic driver: last minute | Status "Sent last minute" |
| Traffic driver: total sent / failed | Status "Failed n of N"; Advanced |
| Traffic driver: cap hits | Advanced |
| Traffic driver: override expires in | Status headline countdown; Traffic description; Advanced |
| Traffic driver: "no driver" message | Dropped: receive-only sims show receive facts instead |
| Request tail (time, method, path, status, latency, chaos) | Activity → Requests received; same columns; admin traffic hidden by default, one checkbox to show |
| Docs tab: spec versions (draft from active / scratch, edit, parse check, save, publish, delete) | Unchanged; publish and delete now confirm |
| Docs tab: guides and changelog editors with preview | Unchanged; delete now confirms |
| Docs tab: Reset from content/ | Docs tab **Reset docs…**, and Danger zone |
| Docs tab: View public docs | Unchanged |
| *(new)* received webhooks (`GET /__control/webhooks`) | Activity → Webhooks received |
| *(new)* Staybase `POST /__control/push-metrics` | Manual controls → Push metrics now |
| *(new)* Pebblepay `/__control/auth-scheme` | Manual controls → Credential scheme (shows current) |
| *(new)* driver per-flow stats, current flow, mutators, seed | Advanced |

The default duration for the traffic override presets tops out at 1 hour (the
old field allowed any 1–86400). A longer override is still one scenario away
(`traffic-burst`/`paused` on Bookbridge take 24 h), or one curl.

## Deploying

The sims pin sim-core by git ref, and `dist/` is committed, so:

1. Merge this repo's PR, then tag `v0.5.0` (annotated) on `main`.
2. In each sim: repin `@okjake/sim-core` to `#v0.5.0` (the draft PRs pin the
   branch commit), `pnpm install`, merge. Render redeploys each service on
   merge (`render.yaml`, auto-deploy).
3. Nothing else: no env var, disk or schedule changes. Staybase moves from
   v0.4.1 and Pebblepay from v0.4.2, so they also pick up v0.4.2 (rendered API
   reference at `/docs/reference`) and v0.4.3 (driver walks past request-less
   steps; inert on sims without a driver).
