import request from 'supertest';

import { normalizeSimCoreConfig, type AdminAction } from '../src';
import { createDemoConfig } from '../examples/demo/demo.config';
import { bearer, createHarness, type TestHarness } from './helpers';

/**
 * v0.5.0 — the two additive surfaces the redesigned /admin reads:
 * `admin` metadata on each scenario listing, and `GET /__control/actions`.
 * Neither changes an existing route's behaviour.
 */
describe('admin UX surfaces (v0.5.0)', () => {
  const pushMetrics: AdminAction = {
    id: 'push-metrics',
    title: 'Push metrics now',
    description: 'Send the daily metrics push immediately.',
    path: '/__control/push-metrics',
  };

  describe('scenario listing', () => {
    let harness: TestHarness;
    beforeAll(async () => {
      harness = await createHarness();
    });
    afterAll(async () => {
      await harness.close();
    });

    it('carries the built-ins’ admin metadata and null for scenarios without any', async () => {
      const res = await request(harness.app.getHttpServer())
        .get('/__control/scenarios')
        .set('authorization', bearer(harness.token))
        .expect(200);
      const byId = new Map(
        (res.body.scenarios as Array<{ id: string; admin: unknown }>).map((s) => [s.id, s]),
      );

      expect(byId.get('error-spike')?.admin).toEqual(
        expect.objectContaining({ title: 'Error storm', group: 'Generic faults' }),
      );
      for (const id of ['latency', 'outage', 'auth-failure']) {
        expect(byId.get(id)?.admin).toEqual(
          expect.objectContaining({ group: 'Generic faults', triggers: expect.any(Array) }),
        );
      }
      // The demo's consumer scenario declares nothing: listed, runnable, `admin: null`.
      expect(byId.get('bad-payloads')?.admin).toBeNull();
    });

    it('still activates a scenario with no metadata exactly as before', async () => {
      await request(harness.app.getHttpServer())
        .post('/__control/scenario')
        .set('authorization', bearer(harness.token))
        .send({ scenario: 'bad-payloads', ttlSeconds: 5 })
        .expect(201);
      await harness.control.reset();
    });
  });

  describe('GET /__control/actions', () => {
    it('returns an empty list when the sim declares none', async () => {
      const harness = await createHarness();
      try {
        const res = await request(harness.app.getHttpServer())
          .get('/__control/actions')
          .set('authorization', bearer(harness.token))
          .expect(200);
        expect(res.body).toEqual({ actions: [] });
      } finally {
        await harness.close();
      }
    });

    it('returns the declared actions verbatim, behind the control guard', async () => {
      const harness = await createHarness({ adminActions: [pushMetrics] });
      try {
        await request(harness.app.getHttpServer()).get('/__control/actions').expect(401);
        const res = await request(harness.app.getHttpServer())
          .get('/__control/actions')
          .set('authorization', bearer(harness.token))
          .expect(200);
        expect(res.body).toEqual({ actions: [pushMetrics] });
      } finally {
        await harness.close();
      }
    });
  });

  describe('adminActions validation at bootstrap', () => {
    const build = (adminActions: AdminAction[]) => () =>
      normalizeSimCoreConfig(createDemoConfig({ adminActions }));

    it('accepts a well-formed action', () => {
      expect(build([pushMetrics])).not.toThrow();
    });

    it.each([
      ['a path outside /__control/', { ...pushMetrics, path: '/v1/charges/ch_000000000001' }],
      ['the bare /__control/ prefix', { ...pushMetrics, path: '/__control/' }],
      ['a path that climbs out with ..', { ...pushMetrics, path: '/__control/../v1/charges' }],
      ['an encoded path that climbs out', { ...pushMetrics, path: '/__control/%2e%2e/v1/charges/x' }],
      ['a path carrying a query string', { ...pushMetrics, path: '/__control/x?y=1' }],
      ['a missing title', { ...pushMetrics, title: '' }],
      ['a missing id', { ...pushMetrics, id: '' }],
      [
        'a choice with no options',
        { ...pushMetrics, choice: { name: 'scheme', label: 'Scheme', options: [] } },
      ],
      [
        'a choice whose currentPath leaves /__control/',
        {
          ...pushMetrics,
          choice: { name: 'scheme', label: 'Scheme', options: ['a'], currentPath: '/admin/assets/admin.js' },
        },
      ],
    ])('rejects %s', (_label, action) => {
      expect(build([action as AdminAction])).toThrow(/adminActions/);
    });

    it('rejects duplicate ids', () => {
      expect(build([pushMetrics, { ...pushMetrics }])).toThrow(/duplicate id/);
    });
  });
});
