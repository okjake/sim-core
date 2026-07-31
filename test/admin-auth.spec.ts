import { Logger } from '@nestjs/common';
import request from 'supertest';

import {
  AdminAuthService,
  DEFAULT_CALLBACK_PATH,
  DEFAULT_SESSION_COOKIE_NAME,
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GoogleJwksCache,
  decodeJwt,
  normalizeSimCoreConfig,
  renderAccessDeniedPage,
  resolveAdminDist,
  verifyGoogleIdToken,
  type AdminAuthConfig,
} from '../src';
import { createDemoConfig } from '../examples/demo/demo.config';
import {
  createGoogleStub,
  generateTestKey,
  jwksFor,
  signIdToken,
  validClaims,
  type GoogleStub,
  type TestKeyPair,
} from './google-stub';
import { bearer, createHarness, wait, type TestHarness } from './helpers';

/**
 * The v0.3.0 admin gate.
 *
 * Two things this file is really testing, beyond the happy path:
 *
 * 1. **The signature check is load-bearing.** `signingKey` is published in the
 *    stub JWKS; `foreignKey` is not. A token signed with the foreign key is a
 *    perfectly well-formed JWT with perfect claims — the only thing wrong with
 *    it is the signature, so any implementation that trusts the payload without
 *    verifying fails that case and only that case.
 * 2. **The machine surfaces did not move.** Every assertion in
 *    "machine surfaces" runs against an app with the gate *enabled*. If the
 *    fleet's platform monitor ever gets a 302 from `/openapi.json`, it reads as
 *    an upstream that deleted its API.
 */

const CLIENT_ID = 'demo-client-id.apps.googleusercontent.com';

let signingKey: TestKeyPair;
let foreignKey: TestKeyPair;

beforeAll(() => {
  signingKey = generateTestKey('sim-core-test-key-1');
  foreignKey = generateTestKey('sim-core-test-key-1'); // same kid, different key
});

interface GatedHarness {
  harness: TestHarness;
  stub: GoogleStub;
  auth: AdminAuthService;
}

async function createGatedHarness(
  adminAuth: Partial<AdminAuthConfig> = {},
  extraKeys: TestKeyPair[] = [],
): Promise<GatedHarness> {
  const stub = createGoogleStub({ keys: [signingKey, ...extraKeys] });
  const harness = await createHarness({
    adminAuth: { fetchImpl: stub.fetchImpl, ...adminAuth },
  });
  return { harness, stub, auth: harness.app.get(AdminAuthService) };
}

const server = (harness: TestHarness): ReturnType<TestHarness['app']['getHttpServer']> =>
  harness.app.getHttpServer();

/**
 * The OIDC `nonce` is minted per sign-in and bound to that state, so a stubbed
 * id_token has to echo the one from the redirect we just followed. Tests run
 * serially, so a single "last redirect" slot is enough.
 */
let lastAuthorizeUrl = '';

/** Kick off a sign-in and hand back the `state` Google would echo. */
async function startLogin(harness: TestHarness, path = '/admin'): Promise<string> {
  const res = await request(server(harness)).get(path).expect(302);
  lastAuthorizeUrl = res.headers.location as string;
  const state = new URL(lastAuthorizeUrl).searchParams.get('state');
  if (!state) throw new Error('no state in the authorization redirect');
  return state;
}

function lastNonce(): string {
  return new URL(lastAuthorizeUrl).searchParams.get('nonce') ?? '';
}

function cookieValue(setCookie: string[] | string | undefined): string {
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!first) throw new Error('no Set-Cookie header');
  return first.split(';')[0] ?? '';
}

/** Full round trip: start, echo the code back, return the session cookie. */
async function signIn(
  ctx: GatedHarness,
  claims = validClaims(),
  key: TestKeyPair = signingKey,
): Promise<{ cookie: string; location: string }> {
  const state = await startLogin(ctx.harness);
  ctx.stub.idToken = signIdToken({ key, claims: { ...claims, nonce: lastNonce() } });

  const res = await request(server(ctx.harness))
    .get(`${DEFAULT_CALLBACK_PATH}?code=stub-code&state=${encodeURIComponent(state)}`)
    .expect(302);

  return {
    cookie: cookieValue(res.headers['set-cookie']),
    location: res.headers.location as string,
  };
}

describe('adminAuth — configuration', () => {
  const valid: AdminAuthConfig = {
    enabled: true,
    googleClientId: CLIENT_ID,
    googleClientSecret: 'secret',
    allowedDomain: 'partnerapi.com',
    sessionSecret: 'x'.repeat(32),
  };

  const withAdminAuth = (adminAuth: AdminAuthConfig): (() => unknown) =>
    (): unknown => normalizeSimCoreConfig({ ...createDemoConfig(), adminAuth });

  it('accepts a complete config', () => {
    expect(withAdminAuth(valid)).not.toThrow();
  });

  it('validates nothing when the gate is absent or disabled', () => {
    expect(() => normalizeSimCoreConfig(createDemoConfig())).not.toThrow();
    expect(
      withAdminAuth({ enabled: false } as unknown as AdminAuthConfig),
    ).not.toThrow();
  });

  it.each([
    ['googleClientId', { googleClientId: '' }, /googleClientId/],
    ['googleClientSecret', { googleClientSecret: '' }, /googleClientSecret/],
    ['allowedDomain', { allowedDomain: '' }, /allowedDomain/],
    ['an address in allowedDomain', { allowedDomain: '@partnerapi.com' }, /bare domain/],
    ['a short sessionSecret', { sessionSecret: 'too-short' }, /sessionSecret/],
    ['a zero sessionTtlHours', { sessionTtlHours: 0 }, /sessionTtlHours/],
    // Positive but far too short. Honouring this issues a cookie that expires
    // between requests, which presents as an admin console reloading forever
    // rather than as a configuration mistake — so it is rejected at bootstrap
    // like any other nonsensical value.
    ['a sub-minute sessionTtlHours', { sessionTtlHours: 0.001 }, /at least/],
    ['a callbackPath outside /admin', { callbackPath: '/auth/cb' }, /callbackPath/],
    ['an empty allowedEmails', { allowedEmails: [] }, /allowedEmails/],
    ['a non-address in allowedEmails', { allowedEmails: ['jake'] }, /allowedEmails/],
  ])('fails closed at bootstrap on %s', (_label, patch, pattern) => {
    expect(withAdminAuth({ ...valid, ...patch } as AdminAuthConfig)).toThrow(pattern);
  });

  it('defaults the ttl, callback path and cookie name', async () => {
    const ctx = await createGatedHarness();
    expect(ctx.auth.settings.sessionTtlHours).toBe(12);
    expect(ctx.auth.settings.callbackPath).toBe(DEFAULT_CALLBACK_PATH);
    expect(ctx.auth.settings.cookieName).toBe(DEFAULT_SESSION_COOKIE_NAME);
    await ctx.harness.close();
  });
});

/**
 * With the gate ON, a `/__control` 401 is the confusing one: the operator has
 * signed in, `/admin` works, and the SPA answers the 401 by silently
 * re-authenticating. The log line is the only thing that separates "your
 * session lapsed" from "this session will never be accepted".
 */
describe('adminAuth — why /__control refused a gated request', () => {
  let ctx: GatedHarness;
  let warn: jest.SpyInstance;

  beforeAll(async () => {
    ctx = await createGatedHarness();
  });
  afterAll(async () => {
    await ctx.harness.close();
  });

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  const warnings = (): string => warn.mock.calls.map((args) => String(args[0])).join('\n');

  it('distinguishes "no cookie sent" from "cookie rejected"', async () => {
    await request(server(ctx.harness)).get('/__control/state').expect(401);
    expect(warnings()).toContain('no bearer token and no cookie was sent at all');
  });

  it('says the session cookie was not accepted, and lists what would cause that', async () => {
    await request(server(ctx.harness))
      .get('/__control/state')
      .set('cookie', 'sim_admin_session=forged.nonsense')
      .expect(401);

    const logged = warnings();
    expect(logged).toContain('session cookie was not accepted');
    // The three real causes, so the reader does not have to guess which.
    expect(logged).toContain('ADMIN_SESSION_SECRET');
    expect(logged).toContain('allowedDomain');
    expect(logged).not.toContain('forged.nonsense');
  });
});

describe('adminAuth — the redirect', () => {
  let ctx: GatedHarness;

  beforeAll(async () => {
    ctx = await createGatedHarness();
  });
  afterAll(async () => {
    await ctx.harness.close();
  });

  it('302s an unauthenticated /admin to Google with the right parameters', async () => {
    const res = await request(server(ctx.harness)).get('/admin').expect(302);
    const url = new URL(res.headers.location as string);

    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZATION_ENDPOINT);
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('hd')).toBe('partnerapi.com');
    expect(url.searchParams.get('redirect_uri')).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/admin\/auth\/callback$/,
    );
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('nonce')).toBeTruthy();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('mints a distinct state and nonce per attempt', async () => {
    const a = new URL(
      (await request(server(ctx.harness)).get('/admin').expect(302)).headers.location as string,
    );
    const b = new URL(
      (await request(server(ctx.harness)).get('/admin').expect(302)).headers.location as string,
    );
    expect(a.searchParams.get('state')).not.toBe(b.searchParams.get('state'));
    expect(a.searchParams.get('nonce')).not.toBe(b.searchParams.get('nonce'));
  });

  it('gates the SPA assets, not just the index', async () => {
    // ServeStaticModule registers plain Express middleware after Nest's, so a
    // guard would never see this request. If this ever returns 200 the gate has
    // been reduced to decoration.
    await request(server(ctx.harness)).get('/admin/assets/admin.js').expect(302);
    await request(server(ctx.harness)).get('/admin/').expect(302);
    await request(server(ctx.harness)).get('/admin/index.html').expect(302);
  });

  it('403s a non-navigation request instead of redirecting it', async () => {
    const res = await request(server(ctx.harness)).post('/admin/anything').expect(403);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('renders a 403 page that leaks no reason and is byte-deterministic', async () => {
    const model = {
      serviceTitle: 'Demo Widgets Co.',
      accent: '#4f46e5',
      allowedDomain: 'partnerapi.com',
    };
    expect(renderAccessDeniedPage(model)).toBe(renderAccessDeniedPage(model));

    const page = renderAccessDeniedPage(model).toLowerCase();
    for (const leak of [
      'email_verified',
      'allowlist',
      'allowedemails',
      'signature',
      'nonce',
      'not verified',
      'hd claim',
      'expired',
    ]) {
      expect(page).not.toContain(leak);
    }
  });
});

describe('adminAuth — the callback', () => {
  let ctx: GatedHarness;

  beforeEach(async () => {
    ctx = await createGatedHarness();
  });
  afterEach(async () => {
    await ctx.harness.close();
  });

  const callback = (state: string, code = 'stub-code') =>
    request(server(ctx.harness)).get(
      `${DEFAULT_CALLBACK_PATH}?code=${code}&state=${encodeURIComponent(state)}`,
    );

  async function attempt(claims = validClaims(), key = signingKey) {
    const state = await startLogin(ctx.harness);
    ctx.stub.idToken = signIdToken({ key, claims: { ...claims, nonce: lastNonce() } });
    return callback(state);
  }

  it('signs a valid Workspace user in and lands them back on /admin', async () => {
    const res = await attempt();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');

    const setCookie = Array.isArray(res.headers['set-cookie'])
      ? (res.headers['set-cookie'][0] as string)
      : String(res.headers['set-cookie']);
    expect(setCookie).toContain(`${DEFAULT_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    // Path=/, not /admin — the session also has to reach /__control.
    expect(setCookie).toContain('Path=/;');
    expect(setCookie).toMatch(/Max-Age=4\d{4}/); // 12h, minus a second or two

    const cookie = cookieValue(res.headers['set-cookie']);
    const after = await request(server(ctx.harness)).get('/admin/').set('cookie', cookie);
    expect(after.status).not.toBe(302);
    if (resolveAdminDist()) {
      expect(after.status).toBe(200);
      expect(after.text).toContain('<div id="root">');
      await request(server(ctx.harness))
        .get('/admin/assets/admin.js')
        .set('cookie', cookie)
        .expect(200);
    }
  });

  it('exchanges the code server-side with the client secret', async () => {
    await attempt();
    const [exchange] = ctx.stub.tokenRequests();
    expect(exchange).toMatchObject({
      code: 'stub-code',
      client_id: CLIENT_ID,
      client_secret: 'demo-client-secret',
      grant_type: 'authorization_code',
    });
    expect(exchange?.redirect_uri).toMatch(/\/admin\/auth\/callback$/);
  });

  it('rejects a token signed with a key that is not in the JWKS', async () => {
    // Same kid, same claims, real RS256 signature — just the wrong key.
    const res = await attempt(validClaims(), foreignKey);
    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it.each([
    ['a consumer account with no hd', { hd: undefined }],
    ['the wrong Workspace domain', { hd: 'evil.example' }],
    ['the right hd but an outside email domain', { email: 'jake@evil.example' }],
    ['an unverified email', { email_verified: false }],
    ['no email at all', { email: undefined }],
    ['the wrong audience', { aud: 'someone-elses-client-id' }],
    ['a non-Google issuer', { iss: 'https://accounts.evil.example' }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ['an iat in the future', { iat: Math.floor(Date.now() / 1000) + 3600 }],
  ])('rejects %s', async (_label, patch) => {
    const res = await attempt(validClaims(patch));
    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a forged alg', async () => {
    const state = await startLogin(ctx.harness);
    ctx.stub.idToken = signIdToken({
      key: signingKey,
      claims: { ...validClaims(), nonce: lastNonce() },
      header: { alg: 'none' },
    });
    await callback(state).expect(403);
  });

  it('rejects a callback with no code', async () => {
    const state = await startLogin(ctx.harness);
    await request(server(ctx.harness))
      .get(`${DEFAULT_CALLBACK_PATH}?state=${encodeURIComponent(state)}`)
      .expect(403);
  });

  it('rejects a tampered state', async () => {
    const state = await startLogin(ctx.harness);
    ctx.stub.idToken = signIdToken({
      key: signingKey,
      claims: { ...validClaims(), nonce: lastNonce() },
    });

    const flip = (s: string): string =>
      `${s.slice(0, -1)}${s.slice(-1) === 'A' ? 'B' : 'A'}`;
    await callback(flip(state)).expect(403);
    await request(server(ctx.harness))
      .get(`${DEFAULT_CALLBACK_PATH}?code=stub-code&state=not-even-signed`)
      .expect(403);
    await request(server(ctx.harness)).get(`${DEFAULT_CALLBACK_PATH}?code=stub-code`).expect(403);
  });

  it('rejects a replayed state', async () => {
    const res = await attempt();
    expect(res.status).toBe(302);

    // Same state, same still-valid id_token, second time.
    const usedState = new URL(lastAuthorizeUrl).searchParams.get('state') as string;
    await callback(usedState).expect(403);
  });

  it('does not leave the pending-login map growing after a sign-in', async () => {
    expect(ctx.auth.pendingCount()).toBe(0);
    await attempt();
    expect(ctx.auth.pendingCount()).toBe(0);
  });

  it('survives a token endpoint that fails', async () => {
    const state = await startLogin(ctx.harness);
    ctx.stub.tokenStatus = 400;
    await callback(state).expect(403);
  });

  it('survives a token response with no id_token', async () => {
    const state = await startLogin(ctx.harness);
    ctx.stub.idToken = null;
    await callback(state).expect(403);
  });

  it('survives an unreachable JWKS', async () => {
    const state = await startLogin(ctx.harness);
    ctx.stub.idToken = signIdToken({
      key: signingKey,
      claims: { ...validClaims(), nonce: lastNonce() },
    });
    ctx.stub.jwksStatus = 500;
    await callback(state).expect(403);
  });
});

describe('adminAuth — state expiry', () => {
  it('rejects a state older than its validity window', async () => {
    const ctx = await createGatedHarness({ stateTtlSeconds: 1 });
    const state = await startLogin(ctx.harness);
    ctx.stub.idToken = signIdToken({
      key: signingKey,
      claims: { ...validClaims(), nonce: lastNonce() },
    });

    await wait(1600);
    await request(server(ctx.harness))
      .get(`${DEFAULT_CALLBACK_PATH}?code=stub-code&state=${encodeURIComponent(state)}`)
      .expect(403);
    await ctx.harness.close();
  });
});

describe('adminAuth — allowedEmails', () => {
  it('lets a listed address through and turns an unlisted one away', async () => {
    const ctx = await createGatedHarness({ allowedEmails: ['Jake@PartnerAPI.com'] });

    const listed = await signIn(ctx, validClaims({ email: 'jake@partnerapi.com' }));
    expect(listed.location).toBe('/admin');

    const state = await startLogin(ctx.harness);
    ctx.stub.idToken = signIdToken({
      key: signingKey,
      claims: {
        ...validClaims({ email: 'someone-else@partnerapi.com' }),
        nonce: lastNonce(),
      },
    });
    await request(server(ctx.harness))
      .get(`${DEFAULT_CALLBACK_PATH}?code=stub-code&state=${encodeURIComponent(state)}`)
      .expect(403);

    await ctx.harness.close();
  });
});

describe('adminAuth — the session cookie', () => {
  let ctx: GatedHarness;

  beforeAll(async () => {
    ctx = await createGatedHarness();
  });
  afterAll(async () => {
    await ctx.harness.close();
  });

  it('carries exactly { email, exp } and nothing else', async () => {
    const { cookie } = await signIn(ctx);
    const value = cookie.slice(cookie.indexOf('=') + 1);
    const payload = JSON.parse(
      Buffer.from(value.split('.')[0] as string, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['email', 'exp']);
    expect(payload.email).toBe('jake@partnerapi.com');
  });

  it('re-redirects when the signature is tampered with', async () => {
    const { cookie } = await signIn(ctx);
    const tampered = `${cookie.slice(0, -1)}${cookie.slice(-1) === 'A' ? 'B' : 'A'}`;
    await request(server(ctx.harness)).get('/admin/').set('cookie', tampered).expect(302);
  });

  it('re-redirects when the payload is swapped for another address', async () => {
    const { cookie } = await signIn(ctx);
    const [name, value = ''] = cookie.split('=');
    const [, signature] = value.split('.');
    const forged = Buffer.from(
      JSON.stringify({ email: 'attacker@evil.example', exp: 9_999_999_999 }),
      'utf8',
    ).toString('base64url');
    await request(server(ctx.harness))
      .get('/admin/')
      .set('cookie', `${name}=${forged}.${signature}`)
      .expect(302);
  });

  it('re-redirects when the session has expired', async () => {
    const expired = ctx.auth.serializeSession({
      email: 'jake@partnerapi.com',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    await request(server(ctx.harness))
      .get('/admin/')
      .set('cookie', `${DEFAULT_SESSION_COOKIE_NAME}=${expired}`)
      .expect(302);
  });

  it('re-redirects a validly signed session for an address outside the domain', async () => {
    // Signed by this service, so only the re-checked authorisation rules stop
    // it — which is the point: narrowing allowedDomain logs people out at once.
    const outsider = ctx.auth.serializeSession({
      email: 'jake@evil.example',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    await request(server(ctx.harness))
      .get('/admin/')
      .set('cookie', `${DEFAULT_SESSION_COOKIE_NAME}=${outsider}`)
      .expect(302);
  });

  it('marks the cookie Secure behind Render TLS', async () => {
    const state = await startLogin(ctx.harness);
    ctx.stub.idToken = signIdToken({
      key: signingKey,
      claims: { ...validClaims(), nonce: lastNonce() },
    });
    const res = await request(server(ctx.harness))
      .get(`${DEFAULT_CALLBACK_PATH}?code=stub-code&state=${encodeURIComponent(state)}`)
      .set('x-forwarded-proto', 'https')
      .expect(302);
    expect(cookieValue(res.headers['set-cookie'])).toBeTruthy();
    const raw = (res.headers['set-cookie'] as unknown as string[])[0] as string;
    expect(raw).toContain('Secure');
  });

  it('leaves the cookie un-Secure over plain HTTP, so local dev is not a redirect loop', async () => {
    const state = await startLogin(ctx.harness);
    ctx.stub.idToken = signIdToken({
      key: signingKey,
      claims: { ...validClaims(), nonce: lastNonce() },
    });
    const res = await request(server(ctx.harness))
      .get(`${DEFAULT_CALLBACK_PATH}?code=stub-code&state=${encodeURIComponent(state)}`)
      .expect(302);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).not.toContain('Secure');
  });
});

describe('adminAuth — logout', () => {
  it('clears the cookie and shows a signed-out page', async () => {
    const ctx = await createGatedHarness();
    const { cookie } = await signIn(ctx);

    const res = await request(server(ctx.harness))
      .get('/admin/auth/logout')
      .set('cookie', cookie)
      .expect(200);

    const cleared = (res.headers['set-cookie'] as unknown as string[])[0] as string;
    expect(cleared).toContain(`${DEFAULT_SESSION_COOKIE_NAME}=;`);
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('Path=/;');
    expect(res.text).toContain('Signed out');

    // The browser would drop it; prove the server also refuses the old value
    // only once it is genuinely gone (the cookie itself is still valid until
    // expiry, which is why logout is a client-side clear, not a revocation).
    await request(server(ctx.harness)).get('/admin/').expect(302);

    await ctx.harness.close();
  });

  it('is reachable without a session', async () => {
    const ctx = await createGatedHarness();
    await request(server(ctx.harness)).get('/admin/auth/logout').expect(200);
    await ctx.harness.close();
  });

  /**
   * Regression: a browser that signed in before v0.4.0 holds the session at
   * `Path=/admin`. Clearing only `Path=/` leaves it in place — and a cookie at
   * that path satisfies `/admin` while never reaching `/__control`, so the
   * console reloads forever with no redirect to Google and nothing in the
   * logs. Sign-out is the only escape a stuck operator has, so it must clear
   * every path the cookie has ever been issued at.
   */
  it('clears the cookie at legacy paths too, not just the current one', async () => {
    const ctx = await createGatedHarness();

    const res = await request(server(ctx.harness)).get('/admin/auth/logout').expect(200);
    const cleared = res.headers['set-cookie'] as unknown as string[];

    const paths = cleared.map((c) => /Path=([^;]+)/.exec(c)?.[1]);
    expect(paths).toContain('/');
    expect(paths).toContain('/admin');

    for (const cookie of cleared) {
      expect(cookie).toContain(`${DEFAULT_SESSION_COOKIE_NAME}=;`);
      expect(cookie).toContain('Max-Age=0');
    }

    await ctx.harness.close();
  });
});

describe('adminAuth — machine surfaces are untouched', () => {
  let ctx: GatedHarness;

  beforeAll(async () => {
    ctx = await createGatedHarness();
  });
  afterAll(async () => {
    await ctx.harness.close();
  });

  it('leaves /health, /openapi.json and the domain API open', async () => {
    for (const path of ['/health', '/openapi.json', '/widgets', '/widgets/w-1']) {
      const res = await request(server(ctx.harness)).get(path);
      expect([200, 201]).toContain(res.status);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('the /__control plane still takes bearer auth, unmodified by the gate', async () => {
    await request(server(ctx.harness))
      .get('/__control/state')
      .set('authorization', bearer(ctx.harness.token))
      .expect(200);
    await request(server(ctx.harness))
      .post('/__control/reset')
      .set('authorization', bearer(ctx.harness.token))
      .expect(201);
    // Still 401 — not 302. Automation must see an auth failure, not a login page.
    await request(server(ctx.harness)).get('/__control/state').expect(401);
  });

  it('leaves /__admin/brand open and display-only', async () => {
    const res = await request(server(ctx.harness)).get('/__admin/brand').expect(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'adminAuth',
      'brand',
      'docs',
      'driver',
      'name',
      'version',
    ]);
    expect(res.body.adminAuth).toBe(true);
  });

  it('leaves the docs surface open when docs are enabled', async () => {
    const stub = createGoogleStub({ keys: [signingKey] });
    const docsHarness = await createHarness({
      docs: true,
      adminAuth: { fetchImpl: stub.fetchImpl },
    });
    await request(server(docsHarness)).get('/docs').expect(200);
    await request(server(docsHarness)).get('/docs/changelog').expect(200);
    await request(server(docsHarness)).get('/openapi.json').expect(200);
    await request(server(docsHarness)).get('/health').expect(200);
    await docsHarness.close();
  });

  it('leaves webhook receivers open', async () => {
    const stub = createGoogleStub({ keys: [signingKey] });
    const hookHarness = await createHarness({
      rawBody: true,
      adminAuth: { fetchImpl: stub.fetchImpl },
    });
    // Unsigned, so a 401 from the receiver — the point is that it is the
    // receiver answering, not a 302 to Google.
    const res = await request(server(hookHarness)).post('/webhooks/platform').send({});
    expect(res.status).not.toBe(302);
    await hookHarness.close();
  });
});

/**
 * v0.4.0: the session cookie is a second, independent way to satisfy
 * `ControlAuthGuard` — not a replacement for `CONTROL_TOKEN`, an addition to
 * it. There is no longer a "can view /admin" vs. "can operate the service"
 * distinction for humans: signing in with Google is sufficient for both.
 */
describe('adminAuth — the session also authorizes /__control', () => {
  it('a signed-in cookie, with no bearer header at all, is accepted', async () => {
    const ctx = await createGatedHarness();
    const { cookie } = await signIn(ctx);

    await request(server(ctx.harness)).get('/__control/state').set('cookie', cookie).expect(200);
    await request(server(ctx.harness))
      .post('/__control/reset')
      .set('cookie', cookie)
      .expect(201);
    await request(server(ctx.harness))
      .get('/__control/scenarios')
      .set('cookie', cookie)
      .expect(200);
    await request(server(ctx.harness))
      .get('/__control/webhooks')
      .set('cookie', cookie)
      .expect(200);

    await ctx.harness.close();
  });

  it('covers the docs sub-routes too', async () => {
    const stub = createGoogleStub({ keys: [signingKey] });
    const harness = await createHarness({ docs: true, adminAuth: { fetchImpl: stub.fetchImpl } });
    const ctx: GatedHarness = { harness, stub, auth: harness.app.get(AdminAuthService) };
    const { cookie } = await signIn(ctx);

    await request(server(harness))
      .get('/__control/docs/spec-versions')
      .set('cookie', cookie)
      .expect(200);
    await request(server(harness))
      .post('/__control/docs/preview')
      .set('cookie', cookie)
      .send({ markdown: '# hi' })
      .expect(200);

    await harness.close();
  });

  it('both credentials remain simultaneously valid — a script is not broken by turning this on', async () => {
    const ctx = await createGatedHarness();
    const { cookie } = await signIn(ctx);

    // Bearer, no cookie:
    await request(server(ctx.harness))
      .get('/__control/state')
      .set('authorization', bearer(ctx.harness.token))
      .expect(200);
    // Cookie, no bearer:
    await request(server(ctx.harness)).get('/__control/state').set('cookie', cookie).expect(200);
    // Neither:
    await request(server(ctx.harness)).get('/__control/state').expect(401);

    await ctx.harness.close();
  });

  it('an invalid Authorization header does not block a valid session from being tried', async () => {
    const ctx = await createGatedHarness();
    const { cookie } = await signIn(ctx);

    await request(server(ctx.harness))
      .get('/__control/state')
      .set('authorization', 'Bearer this-is-not-the-token')
      .set('cookie', cookie)
      .expect(200);

    await ctx.harness.close();
  });

  it('rejects an expired session with no bearer fallback', async () => {
    const ctx = await createGatedHarness();
    const { cookie } = await signIn(ctx, validClaims());
    // Age the cookie past its TTL by forging one signed for a moment already
    // 13 hours in the past, using the service's own signing — reuse `auth`
    // rather than hand-rolling a second signer.
    const expired = ctx.auth.serializeSession({
      email: 'jake@partnerapi.com',
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    void cookie; // the fresh cookie is not what's under test here

    await request(server(ctx.harness))
      .get('/__control/state')
      .set('cookie', `${DEFAULT_SESSION_COOKIE_NAME}=${expired}`)
      .expect(401);

    await ctx.harness.close();
  });

  it('rejects a tampered session cookie', async () => {
    const ctx = await createGatedHarness();
    const { cookie } = await signIn(ctx);
    const tampered = cookie.slice(0, -4) + 'aaaa';

    await request(server(ctx.harness))
      .get('/__control/state')
      .set('cookie', tampered)
      .expect(401);

    await ctx.harness.close();
  });

  it('never falls back to the session when adminAuth is disabled — bearer-only, exactly as v0.1–v0.3', async () => {
    const harness = await createHarness();
    // A cookie of the right NAME, sent by a client that has no idea the gate
    // is off, must not be treated as a credential — there is no session
    // concept at all in this mode.
    await request(server(harness))
      .get('/__control/state')
      .set('cookie', `${DEFAULT_SESSION_COOKIE_NAME}=whatever`)
      .expect(401);
    await request(server(harness))
      .get('/__control/state')
      .set('authorization', bearer(harness.token))
      .expect(200);

    await harness.close();
  });

  it('sets the cookie with Path=/, not Path=/admin, so the browser sends it to /__control', async () => {
    const ctx = await createGatedHarness();
    const state = await startLogin(ctx.harness);
    ctx.stub.idToken = signIdToken({
      key: signingKey,
      claims: { ...validClaims(), nonce: lastNonce() },
    });
    const res = await request(server(ctx.harness))
      .get(`${DEFAULT_CALLBACK_PATH}?code=stub-code&state=${encodeURIComponent(state)}`)
      .expect(302);
    const setCookie = (res.headers['set-cookie'] as unknown as string[])[0] as string;
    expect(setCookie).toContain('Path=/;');
    expect(setCookie).not.toContain('Path=/admin');

    await ctx.harness.close();
  });
});

describe('adminAuth — JWKS handling', () => {
  const JWKS_URI = 'https://jwks.test/certs';

  const verify = (token: string, jwks: GoogleJwksCache): Promise<unknown> =>
    verifyGoogleIdToken(token, { clientId: CLIENT_ID, clockSkewSeconds: 120, jwks });

  it('caches by kid and does not refetch per verification', async () => {
    const stub = createGoogleStub({ keys: [signingKey], jwksUri: JWKS_URI });
    const cache = new GoogleJwksCache(JWKS_URI, 3600, stub.fetchImpl);
    const token = signIdToken({ key: signingKey, claims: validClaims() });

    for (let i = 0; i < 3; i += 1) {
      await verify(token, cache);
    }
    expect(stub.jwksFetches()).toBe(1);
    expect(cache.size()).toBe(1);
  });

  it('refetches after the cache TTL', async () => {
    const stub = createGoogleStub({ keys: [signingKey], jwksUri: JWKS_URI });
    let clock = Date.now();
    const cache = new GoogleJwksCache(JWKS_URI, 60, stub.fetchImpl, () => clock);
    const token = signIdToken({ key: signingKey, claims: validClaims() });

    await verify(token, cache);
    clock += 61_000;
    await verify(token, cache);
    expect(stub.jwksFetches()).toBe(2);
  });

  it('picks up a key rotation on an unknown kid, rate-limited', async () => {
    const rotated = generateTestKey('rotated-key');
    const stub = createGoogleStub({ keys: [signingKey], jwksUri: JWKS_URI });
    let clock = Date.now();
    const cache = new GoogleJwksCache(JWKS_URI, 3600, stub.fetchImpl, () => clock);

    await verify(signIdToken({ key: signingKey, claims: validClaims() }), cache);
    expect(stub.jwksFetches()).toBe(1);

    // Unknown kid inside the refresh floor: rejected without touching Google,
    // so a stream of junk kids cannot turn this service into a load generator.
    const rotatedToken = signIdToken({ key: rotated, claims: validClaims() });
    await expect(verify(rotatedToken, cache)).rejects.toThrow(/JWKS key/);
    expect(stub.jwksFetches()).toBe(1);

    // Past the floor: one refresh, still rejected because Google has not
    // published the new key yet.
    clock += 61_000;
    await expect(verify(rotatedToken, cache)).rejects.toThrow(/JWKS key/);
    expect(stub.jwksFetches()).toBe(2);

    // Google publishes the rotation; the next attempt succeeds.
    stub.jwksBody = jwksFor(signingKey, rotated);
    clock += 61_000;
    await expect(verify(rotatedToken, cache)).resolves.toMatchObject({
      email: 'jake@partnerapi.com',
    });
    expect(stub.jwksFetches()).toBe(3);
  });

  it('decodeJwt refuses anything that is not a three-part JWS', () => {
    expect(() => decodeJwt('a.b')).toThrow(/three-part/);
    expect(() => decodeJwt('not-a-jwt')).toThrow(/three-part/);
    expect(() => decodeJwt('!!.!!.!!')).toThrow(/JSON/);
  });
});
