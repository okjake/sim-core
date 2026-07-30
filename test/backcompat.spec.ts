import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';

import * as simCore from '../src';
import { CHAOS_EXEMPT_PREFIXES, isChaosExempt, normalizeSimCoreConfig } from '../src';
import { createDemoConfig } from '../examples/demo/demo.config';
import { bearer, createHarness, type TestHarness } from './helpers';

/**
 * The contract for consumers repinning `github:okjake/sim-core#v0.1.0` to
 * `#v0.2.0` without opting into anything new.
 *
 * sim-bookbridge and sim-staybase are deployed against v0.1.0 today. If a
 * single assertion in this file fails, the upgrade is not backward compatible
 * and the fix belongs in sim-core, not in a consumer.
 */
describe('backward compatibility with v0.1.0', () => {
  describe('every v0.1.0 export still exists', () => {
    // Transcribed from the v0.1.0 src/index.ts. Do not prune this list.
    const V010_VALUE_EXPORTS = [
      'SimCoreModule',
      'bootstrapSimService',
      'SIM_CORE_CONFIG',
      'normalizeSimCoreConfig',
      'ScenarioRegistryService',
      'BUILTIN_SCENARIOS',
      'latencyScenario',
      'errorSpikeScenario',
      'outageScenario',
      'authFailureScenario',
      'ChaosService',
      'ChaosInterceptor',
      'CHAOS_EXEMPT_PREFIXES',
      'isChaosExempt',
      'DriverService',
      'ControlService',
      'ControlController',
      'ControlAuthGuard',
      'TTL_MIN_SECONDS',
      'TTL_MAX_SECONDS',
      'parseActivateScenarioBody',
      'parseDriverOverrideBody',
      'HealthController',
      'OpenApiController',
      'stripControlPaths',
      'AdminBrandController',
      'resolveAdminDist',
      'RequestTailService',
      'REQUEST_TAIL_CAPACITY',
      'RequestTailMiddleware',
      'createRng',
      'hashSeed',
      'p',
      'describeSchema',
      'ParamValidationError',
    ] as const;

    it.each(V010_VALUE_EXPORTS)('exports %s', (name) => {
      expect(simCore[name]).toBeDefined();
    });

    it('keeps the constants at their documented values', () => {
      expect(simCore.TTL_MIN_SECONDS).toBe(1);
      expect(simCore.TTL_MAX_SECONDS).toBe(86_400);
      expect(simCore.REQUEST_TAIL_CAPACITY).toBe(200);
    });

    it('keeps isChaosExempt callable with a single argument', () => {
      expect(isChaosExempt('/__control/state')).toBe(true);
      expect(isChaosExempt('/health')).toBe(true);
      expect(isChaosExempt('/openapi.json')).toBe(true);
      expect(isChaosExempt('/admin/index.html')).toBe(true);
      expect(isChaosExempt('/widgets')).toBe(false);
      expect(CHAOS_EXEMPT_PREFIXES).toEqual(expect.arrayContaining(['/__control', '/health']));
    });
  });

  describe('a v0.1-style config (no docs, no new fields)', () => {
    let harness: TestHarness;

    beforeAll(async () => {
      harness = await createHarness();
    });

    afterAll(async () => {
      await harness.close();
    });

    const server = (): ReturnType<TestHarness['app']['getHttpServer']> =>
      harness.app.getHttpServer();

    it('normalises without requiring any v0.2.0 field', () => {
      const config = normalizeSimCoreConfig(createDemoConfig());
      expect(config.docs).toBeUndefined();
      expect(config.docsAuthCheck).toBeUndefined();
      expect(config.docsChaosOptIn).toBeUndefined();
      expect(config.requestTailSize).toBe(200);
      expect(config.admin).toBe(true);
    });

    it('constructs no docs service', () => {
      expect(harness.docs).toBeNull();
    });

    it('creates no data directory', () => {
      // The docs engine is the only thing in sim-core that persists anything,
      // so a docs-disabled service must leave no DATA_DIR behind at all.
      expect(existsSync(resolve(process.cwd(), 'data'))).toBe(false);
    });

    it('serves /health exactly as before', async () => {
      const res = await request(server()).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok', uptime: expect.any(Number), version: '0.1.0' });
    });

    it('serves the static config spec at /openapi.json with the v0.1.0 ETag shape', async () => {
      const res = await request(server()).get('/openapi.json').expect(200);
      expect(res.body.info.title).toBe('Demo Widgets API');
      expect(Object.keys(res.body.paths)).toEqual([
        '/widgets',
        '/widgets/{id}',
        '/widgets/orders',
      ]);
      expect(res.headers.etag).toMatch(/^"[0-9a-f]{32}"$/);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
      expect(new Date(res.headers['last-modified'] as string).toString()).not.toBe(
        'Invalid Date',
      );

      await request(server())
        .get('/openapi.json')
        .set('if-none-match', res.headers.etag as string)
        .expect(304);
    });

    it('404s the docs routes rather than serving an empty docs site', async () => {
      await request(server()).get('/docs').expect(404);
      await request(server()).get('/docs/changelog').expect(404);
      await request(server()).get('/docs/guides/anything').expect(404);
    });

    it('404s the docs control routes but keeps the v0.1.0 control plane intact', async () => {
      const token = bearer(harness.token);
      await request(server()).get('/__control/docs').set('authorization', token).expect(404);
      await request(server())
        .get('/__control/docs/spec-versions')
        .set('authorization', token)
        .expect(404);

      await request(server()).get('/__control/state').set('authorization', token).expect(200);
      await request(server())
        .get('/__control/scenarios')
        .set('authorization', token)
        .expect(200);
      await request(server()).get('/__control/requests').set('authorization', token).expect(200);
      await request(server()).post('/__control/reset').set('authorization', token).expect(201);
    });

    it('still 401s the whole control plane without a token', async () => {
      await request(server()).get('/__control/state').expect(401);
      await request(server()).get('/__control/scenarios').expect(401);
      await request(server()).post('/__control/reset').expect(401);
    });

    it('keeps chaos off /openapi.json and /health during an outage scenario', async () => {
      await harness.control.activateScenario({
        scenario: 'outage',
        params: {},
        ttlSeconds: 10,
      });
      await request(server()).get('/widgets').expect(503);
      await request(server()).get('/openapi.json').expect(200);
      await request(server()).get('/health').expect(200);
      await harness.control.reset();
      await request(server()).get('/widgets').expect(200);
    });

    it('keeps the driver, scenarios and request tail working unchanged', async () => {
      const token = bearer(harness.token);
      const state = await request(server()).get('/__control/state').set('authorization', token);
      expect(state.body.driver.configured).toBe(true);
      expect(state.body.baseline.overall).toBe(true);
      expect(state.body.scenariosAvailable).toEqual(
        expect.arrayContaining(['latency', 'error-spike', 'outage', 'auth-failure']),
      );

      await request(server())
        .post('/__control/driver')
        .set('authorization', token)
        .send({ mode: 'burst', multiplier: 2, ttlSeconds: 5 })
        .expect(201);
      await request(server()).post('/__control/reset').set('authorization', token).expect(201);
    });
  });

  describe('additive-only surface changes', () => {
    it('adds `docs` to /__admin/brand without removing anything', async () => {
      const harness = await createHarness();
      const res = await request(harness.app.getHttpServer())
        .get('/__admin/brand')
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'demo',
        version: '0.1.0',
        brand: { displayName: 'Demo Widgets Co.', color: '#4f46e5' },
        driver: true,
      });
      expect(res.body.docs).toBe(false);
      await harness.close();
    });

    it('adds /__control/webhooks, which needs no new config', async () => {
      const harness = await createHarness();
      await request(harness.app.getHttpServer())
        .get('/__control/webhooks')
        .set('authorization', bearer(harness.token))
        .expect(200);
      await harness.close();
    });
  });
});
