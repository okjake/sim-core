# Fleet setup — one sitting, in order

Everything the sim fleet needs to go from "code complete" to "generating real
traffic in staging". It is written to be done in a single session, top to
bottom: each step's output is the next step's input, and the ordering is the
part that is easy to get wrong. Budget 60–90 minutes.

The fleet is three fictional companies plus the engine they share:

```
sim-bookbridge ──HTTP──▶ sim-staybase ──HTTP──▶ sim-pebblepay
   (partner:              (tenant: the STR         (upstream: the payments
    channel manager)       platform)                vendor it depends on)
                               │
                               │  @partner-api/logger → staging ingest
                               ▼
                     partner-api staging platform
                               │
                               └── webhooks ──▶ receivers on Staybase + Bookbridge
                               └── spec monitor ──▶ polls Pebblepay's public docs
```

Only **Staybase** holds platform credentials. Bookbridge is an ordinary API
consumer; Pebblepay has no relationship with the platform at all — it is simply
a vendor whose docs we watch.

| Repo | Role | Deployed as |
| --- | --- | --- |
| [`sim-core`](https://github.com/okjake/sim-core) | Shared engine. Not deployed. | — |
| [`sim-staybase`](https://github.com/okjake/sim-staybase) | Tenant | `staybase.partnerapi.cloud` |
| [`sim-bookbridge`](https://github.com/okjake/sim-bookbridge) | Partner | `bookbridge.partnerapi.cloud` |
| [`sim-pebblepay`](https://github.com/okjake/sim-pebblepay) | Upstream | `pebblepay.partnerapi.cloud` |

Per-repo detail lives in each repo's own `SETUP.md` and `README.md`; this file
is the ordering and the cross-repo values, not a replacement for them.

---

## 0. Prerequisites

- [ ] Render account with a paid plan available (two services need disks, and
      no service can be `free` — free instances sleep, and a sleeping traffic
      driver is indistinguishable from an outage).
- [ ] DNS control for **partnerapi.cloud**.
- [ ] Google Workspace admin (or at least the ability to create an OAuth client
      in a Google Cloud project) for the `@partnerapi.com` admin gate.
- [ ] Super-admin access to partner-api **staging**.
- [ ] npm publish rights for the `@partner-api` scope (step 6 only).
- [ ] A password manager entry to collect secrets as you go — this process
      mints about a dozen, several of which are shown exactly once.

**Why this order.** Three dependencies force it: Render must issue certificates
before Google will accept the redirect URIs; the platform mints webhook secrets
only *after* the receiving service is deployed and reachable; and Staybase
cannot report traffic until it holds a tenant token and an app key that only
exist once the staging wiring has run. Everything below follows from that.

---

## 1. DNS

Three CNAMEs on `partnerapi.cloud`, pointed at the Render services you create in
step 3. If you prefer to do DNS first, create the Render services (step 3) with
their `domains:` blocks and come back — Render shows the exact CNAME target per
service under **Settings → Custom Domains**.

| Host | Target |
| --- | --- |
| `staybase.partnerapi.cloud` | `sim-staybase.onrender.com` |
| `bookbridge.partnerapi.cloud` | `sim-bookbridge.onrender.com` |
| `pebblepay.partnerapi.cloud` | `pebblepay`'s Render host |

- [ ] All three CNAMEs created.
- [ ] Render shows **Certificate issued** for each (usually a few minutes; it
      will not issue before DNS resolves).

Do not skip ahead to step 2 until certificates are live: Google rejects
redirect URIs on hosts it cannot reach over HTTPS, and the platform's webhook
dispatcher refuses to deliver to anything that is not a real public HTTPS host
(it also refuses redirects and private IPs).

---

## 2. Google OAuth client — the `/admin` gate

One OAuth **web application** client covers the whole fleet. It gates only the
operator SPA at `/admin` on each service. Every machine surface stays open, by
design: the domain APIs, `/docs`, `/openapi.json`, the webhook receivers,
`/health`, and the `/__control` bearer plane. The platform polls docs and
delivers webhooks unauthenticated — a redirect to Google on those paths would
read as an outage.

- [ ] Google Cloud console → **APIs & Services → Credentials → Create
      credentials → OAuth client ID → Web application**.
- [ ] Name it something recoverable, e.g. `partnerapi sim fleet admin`.
- [ ] Authorized redirect URIs — Google matches these **exactly**, so all four:

```
https://staybase.partnerapi.cloud/admin/auth/callback
https://bookbridge.partnerapi.cloud/admin/auth/callback
https://pebblepay.partnerapi.cloud/admin/auth/callback
http://localhost:4200/admin/auth/callback
```

- [ ] Copy the **client ID** and **client secret** — they go into all three
      Render services as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

`ADMIN_SESSION_SECRET` is **not** shared: each service generates its own (the
blueprints use `generateValue: true`). One secret across the fleet would make a
session cookie minted by one sim valid on the others. Rotating that secret is
also the only way to evict a signed-in session before its 12-hour TTL.

---

## 3. Render services

Create in this order — **Pebblepay, then Staybase, then Bookbridge** — so each
service's dependency already has a URL when you configure it.

All three: region **frankfurt** (the platform's ingest and Loki live in AWS
`eu-north-1`), branch `main`, autodeploy on, `plan: starter` or higher.

For each repo: **Render dashboard → Blueprints → New Blueprint Instance**,
point it at the repo, and it reads that repo's `render.yaml`. Everything marked
`sync: false` must be filled in by hand.

- [ ] **sim-pebblepay** — needs a **1 GB disk** mounted at `/var/data`
      (`DATA_DIR`). The docs engine is SQLite-backed and the disk is what makes
      published spec versions survive a restart. Set `PEBBLEPAY_API_KEYS` to a
      key you invent now; Staybase will use it in the next step, and it is also
      what you register on the platform as the upstream credential in step 5.
- [ ] **sim-staybase** — needs a **1 GB disk** at `/var/data` too. Set
      `PEBBLEPAY_API_KEY` to the key you just invented. Leave `TENANT_TOKEN`,
      `PARTNER_KEYS` and `WEBHOOK_SECRET` blank for now — step 5 produces them.
      The service runs fine without them: reporting is simply off, and checkout
      falls back to an internal stub charge.
- [ ] **sim-bookbridge** — no disk. Set `STAYBASE_API_KEY` to the bearer key you
      will put in Staybase's `PARTNER_KEYS` in step 5 (invent it now — it is
      Bookbridge's key *at Staybase*, not a platform credential). Leave
      `WEBHOOK_SECRET` blank.
- [ ] Private-dependency access for the builds: all three consume
      `@okjake/sim-core` from a private repo. Render has no per-service
      "add an SSH key" flow for this — the mechanism is a plain env var:

      1. GitHub → your account → **Settings → Developer settings → Fine-grained
         personal access tokens → Generate new token**. Scope it to **only**
         `okjake/sim-core`, **read-only** (Contents: Read). One token can be
         reused across all three services — it's read-only either way.
      2. Set it as `GH_TOKEN` on each of the three services (`sync: false` in
         every `render.yaml`, so Render will prompt for it).
      3. Staybase and Bookbridge build via Docker: Render passes service env
         vars into Docker builds as build args, and each `Dockerfile` already
         declares `ARG GH_TOKEN=""` and rewrites `github.com` → an
         `x-access-token` URL before `pnpm install` when it's set.
      4. Pebblepay builds natively (no Dockerfile) — its `buildCommand` in
         `render.yaml` does the same URL rewrite directly, reading `GH_TOKEN`
         as a normal shell env var, before `pnpm install` runs.

      Without this the build fails at install with a git auth error — that
      failure mode is the tell if a token wasn't picked up.
- [ ] Record every `CONTROL_TOKEN` Render generates — needed for
      scripted/automated scenario control (curl, CI, the eventual agent
      pipeline). A human operating the console through a browser doesn't need
      it: signing in with Google at `/admin` is sufficient on its own.

**Env matrix** — every variable, where it comes from, and the earliest moment it
can be filled:

| Variable | Service(s) | Value comes from | Available |
| --- | --- | --- | --- |
| `CONTROL_TOKEN` | all three | Render `generateValue` | step 3 |
| `ADMIN_AUTH_ENABLED` | all three | literal `true` | step 3 |
| `GOOGLE_CLIENT_ID` / `_SECRET` | all three | step 2 | step 2 |
| `ADMIN_ALLOWED_DOMAIN` | all three | literal `partnerapi.com` | step 3 |
| `ADMIN_SESSION_SECRET` | all three | Render `generateValue`, per service | step 3 |
| `GH_TOKEN` | all three (build) | GitHub PAT or deploy key | step 3 |
| `PEBBLEPAY_API_KEYS` | pebblepay | you invent it | step 3 |
| `DATA_DIR` | staybase, pebblepay | literal `/var/data` (disk mount) | step 3 |
| `PEBBLEPAY_BASE_URL` | staybase | `https://pebblepay.partnerapi.cloud` | step 3 |
| `PEBBLEPAY_API_KEY` | staybase | one of Pebblepay's keys | step 3 |
| `STAYBASE_BASE_URL` | bookbridge | `https://staybase.partnerapi.cloud` | step 3 |
| `STAYBASE_API_KEY` | bookbridge | you invent it; must match Staybase's `PARTNER_KEYS` | step 3 |
| `INGEST_URL` | staybase | staging ingest base URL, no `/logs` suffix | step 5 |
| `TENANT_TOKEN` | staybase | platform, `tenant_live_…` | step 5 |
| `PARTNER_KEYS` | staybase | JSON; needs the platform app key | step 5 |
| `WEBHOOK_SECRET` | staybase, bookbridge | platform, shown **once** at registration | step 5 |

---

## 4. Deploy and sanity-check

- [ ] All three services green in Render.
- [ ] `curl https://pebblepay.partnerapi.cloud/health` → `{"status":"ok",…}`
      (repeat for the other two).
- [ ] `https://pebblepay.partnerapi.cloud/openapi.json` returns the baseline
      spec with an `ETag` and `Last-Modified` — this is what the platform's
      spec monitor will poll.
- [ ] Visit `https://staybase.partnerapi.cloud/admin` in a browser: you should
      be redirected to Google, and land back on a fully working control panel
      after signing in with your `@partnerapi.com` account — no token to
      paste. Since sim-core v0.4.0, the Google session itself authorizes
      `/__control` as well as loading the page, so anyone on the domain who
      can sign in can operate the console (activate scenarios, publish spec
      versions, reset). `CONTROL_TOKEN` still exists and still works — it's
      what scripts and automation use — but a human never needs it.
- [ ] Bookbridge is already generating traffic against Staybase; confirm on its
      status page at `https://bookbridge.partnerapi.cloud/`.

---

## 5. Platform staging wiring

This is the long part. **`sim-staybase/SETUP.md` is the authoritative
step-by-step** — it has the exact endpoints, request bodies and gotchas for
each platform flow. Work through it there; the ordering below is what matters
across repos, and the values you must carry back to Render.

0. **Deploy the staging log pipeline first, if it isn't already live** — the
   platform's own `ingest.partnerapi.com` only validates against
   *production's* database, so it 401s a staging fixture tenant's traffic.
   `infra/staging-log-pipeline` in the main repo (PR #3999) is a minimal
   ingest + Loki pair that exists specifically to fix that; its readme has
   the deploy order and env vars. `INGEST_URL` in step 5 below is
   **`papi-ingest-staging`'s URL, not the production one.**
1. **Create the fixture tenant** (super-admin `POST /tenants`). Note the tenant
   id and subdomain.
2. **Mint the tenant token** → this is Staybase's `TENANT_TOKEN`.
3. **Create the Bookbridge partner**, then request and approve its app; reveal
   the app API key. Note the partner id (a UUID) and the app key.
4. **Assemble `PARTNER_KEYS`** for Staybase — a single-line JSON object mapping
   *the bearer key Bookbridge sends* to the platform identity to file its
   traffic under:

   ```json
   {"<STAYBASE_API_KEY from step 3>":{"partner":"bookbridge","appApiKey":"<platform app key>","partnerId":"<platform partner id>"}}
   ```

   `partnerId` is optional but worth setting: with it, the SDK emits `partnerId`
   as a Loki **stream label**, so one partner's traffic is selectable without a
   `| json` filter.
5. **Set `TENANT_TOKEN`, `PARTNER_KEYS` and `INGEST_URL`** (from step 0) in
   Render on sim-staybase and redeploy. Traffic starts flowing into staging
   within a minute — but is only *visible* once staging's `apps/management`
   is also pointed at `papi-loki-staging` for reads (same readme).
6. **Register webhook endpoints** (platform flows are under `/billing`, per
   Staybase's SETUP.md):
   - tenant-level → `https://staybase.partnerapi.cloud/webhooks/partner-api`
   - partner-scoped (Bookbridge) → `https://bookbridge.partnerapi.cloud/webhooks/platform`

   Each registration returns a signing secret **exactly once**. Paste them into
   the respective services' `WEBHOOK_SECRET` in Render and redeploy. Until you
   do, deliveries are rejected 401 with `reason: "no-secret"` and recorded at
   `GET /__control/webhooks` — which is a perfectly good way to confirm the
   platform is reaching the right host.
7. **Enable the `upstream_integrations` feature flag** on the fixture tenant.
8. **Register Pebblepay as an upstream integration**: spec URL
   `https://pebblepay.partnerapi.cloud/openapi.json`, changelog/page URL
   `https://pebblepay.partnerapi.cloud/docs/changelog`, environment `sandbox`,
   credential type **bearer** with one of Pebblepay's `PEBBLEPAY_API_KEYS`.

---

## 6. Publish the logging SDK

Staybase currently vendors `@partner-api/logger` as a tarball, because the
version on npm predates PAPI-687 and would silently drop every outbound log's
upstream attribution. The republish is prepared but not merged.

- [ ] Merge monorepo PR **#3977** (`chore(logger): bump to 1.1.0 for npm
      republish + publish hygiene`).
- [ ] Publish it:

  ```bash
  cd ~/Projects/partner-api/packages/logger
  npm login
  npm publish            # prepublishOnly clean-builds and guards dist casing
  ```

- [ ] Swap Staybase off the vendored copy:

  ```bash
  cd ~/Projects/sim-staybase
  # package.json: "@partner-api/logger": "file:vendor/partner-api-logger-1.0.0.tgz"
  #            -> "@partner-api/logger": "^1.1.0"
  pnpm install
  rm -rf vendor
  pnpm verify
  git commit -am "chore: consume @partner-api/logger from npm"
  git push
  ```

Staybase then consumes the SDK exactly the way a real partner does, which is
the point of the whole exercise.

---

## 7. Verification

**Logs are flowing.** In Grafana against the staging tenant. Note the label set
is deliberately small — the real SDK emits only `level`, `partnerId` and
`direction`; everything else lives in the JSON line:

```logql
{tenantId="<tenant id>"} | json | sim_service="staybase"
{tenantId="<tenant id>", direction="outbound"} | json | upstream_integration="pebblepay"
{tenantId="<tenant id>"} | json | status_code>=400
{tenantId="<tenant id>"} | json | synthetic="true"     # all fleet traffic
```

- [ ] Inbound entries appear within a minute of Bookbridge's next tick.
- [ ] The tenant's traffic surface in the portal shows partner activity, and the
      per-partner breakdown attributes it to Bookbridge.
- [ ] Force a checkout (Bookbridge's `checkout` flow, or use its `/admin` to
      burst) and confirm an **outbound** entry with `upstream_integration`.

**Webhooks work.** Use the platform's test-ping on each registered endpoint —
expect 200, and the delivery recorded at
`GET /__control/webhooks` on the receiving service (bearer `CONTROL_TOKEN`).

**Upstream monitoring works.** From Pebblepay's `/admin`, publish the
`additive` spec version (or edit the spec freehand). The platform's next poll
should produce a spec-change report on the tenant's upstream-integration page,
classified `additive` and routed to the daily digest. Then publish `breaking`
to see an immediate breaking-change notification and webhook. Reset with
`POST /__control/reset-docs` when you are done.

**Failure modes behave.** From `/admin` on each service, with a TTL so nothing
outlives the session:

| Try this | Expect |
| --- | --- |
| Pebblepay `degradation` | Staybase outbound error rate climbs; checkouts return 502; the domain API stays up |
| Pebblepay `credential-expiry` | 401s on outbound charges; drives the platform's `credential_error` state |
| Bookbridge `use-deprecated-v1` | Traffic moves to Staybase's `/v1/reservations` — **201s, not errors**; visible only in the route label |
| Bookbridge `malformed-payloads` | 422 spike on Staybase |
| Bookbridge `expired-api-key` | 401 spike on Staybase |

Every scenario takes a mandatory TTL and reverts itself; `POST /__control/reset`
reverts immediately. That is deliberate — a Friday experiment must not still be
running on Monday.

---

## Afterwards

- Rotation and teardown notes are in each repo's `SETUP.md`.
- `docs/bug-catalog.md` in sim-staybase and sim-bookbridge lists plantable
  defects — each with the exact diff, the log signature it produces in staging,
  and the test that catches it. Nothing is planted; they are the raw material
  for the "logs indicate an issue → agent opens a PR" pipeline, and they are
  best introduced one at a time.
- The one platform-side gap that pipeline still needs: a long-lived machine
  credential for the management API. Service-account tokens are read-only for
  logs, PATs are super-admin, and the web bearer expires in five minutes.
