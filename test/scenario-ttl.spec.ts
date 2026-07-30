import request from 'supertest';

import { TTL_MAX_SECONDS } from '../src';
import { bearer, createHarness, wait, type TestHarness } from './helpers';

describe('scenario activation + mandatory TTL', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await harness.close();
  });

  const post = (body: object) =>
    request(harness.app.getHttpServer())
      .post('/__control/scenario')
      .set('authorization', bearer(harness.token))
      .send(body);

  describe('validation', () => {
    it('rejects a missing ttlSeconds', async () => {
      const res = await post({ scenario: 'outage' }).expect(400);
      expect(res.body.errors.ttlSeconds).toBe('is required');
    });

    it('rejects ttlSeconds below the minimum', async () => {
      const res = await post({ scenario: 'outage', ttlSeconds: 0 }).expect(400);
      expect(res.body.errors.ttlSeconds).toContain('between 1 and 86400');
    });

    it('rejects ttlSeconds above the maximum', async () => {
      const res = await post({
        scenario: 'outage',
        ttlSeconds: TTL_MAX_SECONDS + 1,
      }).expect(400);
      expect(res.body.errors.ttlSeconds).toContain('between 1 and 86400');
    });

    it('rejects a non-integer ttlSeconds', async () => {
      await post({ scenario: 'outage', ttlSeconds: 12.5 }).expect(400);
    });

    it('accepts the boundary values', async () => {
      await post({ scenario: 'outage', ttlSeconds: 1 }).expect(201);
      await post({ scenario: 'outage', ttlSeconds: TTL_MAX_SECONDS }).expect(201);
    });

    it('rejects an unknown scenario', async () => {
      const res = await post({ scenario: 'nope', ttlSeconds: 60 }).expect(404);
      expect(res.body.error).toBe('unknown_scenario');
      expect(res.body.available).toContain('outage');
    });

    it('rejects invalid scenario params', async () => {
      const res = await post({
        scenario: 'error-spike',
        params: { rate: 42 },
        ttlSeconds: 60,
      }).expect(400);
      expect(res.body.error).toBe('invalid_scenario_params');
    });

    it('applies scenario param defaults', async () => {
      const res = await post({ scenario: 'latency', ttlSeconds: 60 }).expect(201);
      expect(res.body.scenario.params).toEqual({ baseMs: 750, jitterMs: 250 });
    });
  });

  it('reports the active scenario and a shrinking remainingSeconds', async () => {
    await post({ scenario: 'outage', ttlSeconds: 300 }).expect(201);

    const res = await request(harness.app.getHttpServer())
      .get('/__control/state')
      .set('authorization', bearer(harness.token))
      .expect(200);

    expect(res.body.scenario.id).toBe('outage');
    expect(res.body.scenario.ttlSeconds).toBe(300);
    expect(res.body.scenario.remainingSeconds).toBeLessThanOrEqual(300);
    expect(res.body.scenario.remainingSeconds).toBeGreaterThan(290);
    expect(res.body.baseline.overall).toBe(false);
    expect(res.body.chaos.rules).toHaveLength(1);
  });

  it('activating a second scenario replaces (and reverts) the first', async () => {
    await post({ scenario: 'outage', ttlSeconds: 300 }).expect(201);
    await request(harness.app.getHttpServer()).get('/widgets').expect(503);

    await post({ scenario: 'auth-failure', ttlSeconds: 300 }).expect(201);
    await request(harness.app.getHttpServer()).get('/widgets').expect(401);

    expect(harness.chaos.rules()).toHaveLength(1);
    expect(harness.control.activeScenario()?.id).toBe('auth-failure');
  });

  it('auto-reverts over the wire when the TTL expires', async () => {
    await post({ scenario: 'outage', ttlSeconds: 1 }).expect(201);
    await request(harness.app.getHttpServer()).get('/widgets').expect(503);

    await wait(1_200);

    await request(harness.app.getHttpServer()).get('/widgets').expect(200);
    expect(harness.control.activeScenario()).toBeNull();
    expect(harness.chaos.isBaseline()).toBe(true);
  });

  it('auto-reverts a long TTL under fake timers', async () => {
    jest.useFakeTimers();

    await harness.control.activateScenario({
      scenario: 'outage',
      params: {},
      ttlSeconds: 3_600,
    });
    expect(harness.chaos.isBaseline()).toBe(false);

    await jest.advanceTimersByTimeAsync(3_599_000);
    expect(harness.control.activeScenario()?.id).toBe('outage');

    await jest.advanceTimersByTimeAsync(2_000);
    expect(harness.control.activeScenario()).toBeNull();
    expect(harness.chaos.isBaseline()).toBe(true);
    expect(harness.control.state().baseline.overall).toBe(true);
  });

  it('reverts driver-level scenario hooks too', async () => {
    await post({ scenario: 'bad-payloads', ttlSeconds: 1 }).expect(201);
    expect(harness.driver.status().requestMutators).toBe(1);

    await wait(1_200);
    expect(harness.driver.status().requestMutators).toBe(0);
  });
});
