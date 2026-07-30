import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import request from 'supertest';

import { DriverService, type DriverConfig, type FetchLike } from '../src';
import { demoFlows } from '../examples/demo/demo.config';
import { bearer, createHarness, wait, type TestHarness } from './helpers';

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function recordingFetch(): { calls: Recorded[]; impl: FetchLike } {
  const calls: Recorded[] = [];
  const impl: FetchLike = (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    return Promise.resolve({
      status: 200,
      ok: true,
      headers: { forEach: () => undefined },
      text: () => Promise.resolve(JSON.stringify({ widgets: [{ id: 'w-9' }] })),
    });
  };
  return { calls, impl };
}

function makeDriver(overrides: Partial<DriverConfig> = {}): {
  driver: DriverService;
  calls: Recorded[];
} {
  const { calls, impl } = recordingFetch();
  const driver = new DriverService({
    baseUrl: 'http://sim.test',
    flows: demoFlows,
    baselineRequestsPerMinute: 600,
    maxRequestsPerMinute: 5,
    seed: 'fixed-seed',
    autoStart: false,
    fetchImpl: impl,
    ...overrides,
  });
  return { driver, calls };
}

describe('traffic driver', () => {
  describe('hard rate cap', () => {
    it('never exceeds maxRequestsPerMinute no matter how often it ticks', async () => {
      const { driver, calls } = makeDriver({ maxRequestsPerMinute: 5 });
      const now = Date.now();

      for (let i = 0; i < 50; i += 1) {
        await driver.tick(now + i);
      }

      expect(calls).toHaveLength(5);
      expect(driver.status().capHits).toBeGreaterThan(0);
      expect(driver.requestsLastMinute(now + 50)).toBe(5);
    });

    it('holds even in burst mode with a large multiplier', async () => {
      const { driver, calls } = makeDriver({ maxRequestsPerMinute: 3 });
      driver.setMode('burst', 100);
      const now = Date.now();

      for (let i = 0; i < 40; i += 1) {
        await driver.tick(now + i);
      }

      expect(calls).toHaveLength(3);
      expect(driver.effectiveRequestsPerMinute()).toBeLessThanOrEqual(3);
    });

    it('releases capacity as the sliding window advances', async () => {
      const { driver, calls } = makeDriver({ maxRequestsPerMinute: 2 });
      const now = Date.now();

      await driver.tick(now);
      await driver.tick(now + 1);
      await driver.tick(now + 2);
      expect(calls).toHaveLength(2);

      await driver.tick(now + 61_000);
      expect(calls).toHaveLength(3);
    });
  });

  describe('paused mode', () => {
    it('issues no requests while paused, and resumes on baseline', async () => {
      const { driver, calls } = makeDriver({ maxRequestsPerMinute: 60 });
      driver.setMode('paused');

      for (let i = 0; i < 10; i += 1) {
        expect(await driver.tick(Date.now() + i)).toBeNull();
      }
      expect(calls).toHaveLength(0);
      expect(driver.effectiveRequestsPerMinute()).toBe(0);

      driver.setMode('baseline');
      await driver.tick();
      expect(calls).toHaveLength(1);
    });
  });

  describe('seeded RNG reproducibility', () => {
    it('two drivers with the same seed produce an identical request sequence', async () => {
      const a = makeDriver({ maxRequestsPerMinute: 1000, seed: 'reproducible' });
      const b = makeDriver({ maxRequestsPerMinute: 1000, seed: 'reproducible' });

      for (let i = 0; i < 40; i += 1) {
        await a.driver.tick(1_000 + i);
        await b.driver.tick(1_000 + i);
      }

      expect(a.calls.length).toBeGreaterThan(30);
      expect(a.calls.map((c) => `${c.method} ${c.url} ${c.body ?? ''}`)).toEqual(
        b.calls.map((c) => `${c.method} ${c.url} ${c.body ?? ''}`),
      );
      expect(a.driver.status().flows).toEqual(b.driver.status().flows);
    });

    it('a different seed produces a different sequence', async () => {
      const a = makeDriver({ maxRequestsPerMinute: 1000, seed: 'seed-a' });
      const b = makeDriver({ maxRequestsPerMinute: 1000, seed: 'seed-b' });

      for (let i = 0; i < 40; i += 1) {
        await a.driver.tick(1_000 + i);
        await b.driver.tick(1_000 + i);
      }

      expect(a.calls.map((c) => c.url)).not.toEqual(b.calls.map((c) => c.url));
    });

    it('contains no unseeded randomness in driver logic', () => {
      // Belt-and-braces: the whole point of the seed is reproducibility.
      const source = readFileSync(
        resolve(__dirname, '../src/driver/driver.service.ts'),
        'utf8',
      );
      expect(source).not.toContain('Math.random');
    });
  });

  describe('flow mechanics', () => {
    it('carries state between steps of a flow', async () => {
      const { driver, calls } = makeDriver({
        maxRequestsPerMinute: 1000,
        flows: [demoFlows[0]!],
      });

      await driver.tick(1);
      await driver.tick(2);

      expect(calls[0]?.url).toBe('http://sim.test/widgets');
      // The id came out of step 1's response body.
      expect(calls[1]?.url).toBe('http://sim.test/widgets/w-9');
    });

    it('applies configured base headers', async () => {
      const { driver, calls } = makeDriver({
        maxRequestsPerMinute: 1000,
        headers: { authorization: 'Bearer real-key' },
      });
      await driver.tick(1);
      expect(calls[0]?.headers.authorization).toBe('Bearer real-key');
    });

    it('request mutators rewrite outgoing requests and can be removed', async () => {
      const { driver, calls } = makeDriver({ maxRequestsPerMinute: 1000 });
      const remove = driver.addRequestMutator((req) => ({
        ...req,
        headers: { ...(req.headers ?? {}), authorization: 'Bearer expired' },
      }));

      await driver.tick(1);
      expect(calls[0]?.headers.authorization).toBe('Bearer expired');

      remove();
      await driver.tick(2);
      expect(calls[1]?.headers.authorization).toBeUndefined();
    });

    it('survives a transport failure without throwing', async () => {
      const { driver } = makeDriver({
        maxRequestsPerMinute: 1000,
        fetchImpl: () => Promise.reject(new Error('ECONNREFUSED')),
      });
      const res = await driver.tick(1);
      expect(res).toMatchObject({ ok: false, status: 0, error: 'ECONNREFUSED' });
      expect(driver.status().totalFailures).toBe(1);
    });
  });

  describe('rhythm curve', () => {
    it('scales the baseline rate by the hour-of-day multiplier', () => {
      const weekday = new Array<number>(24).fill(1);
      weekday[9] = 3;
      const { driver } = makeDriver({
        baselineRequestsPerMinute: 4,
        maxRequestsPerMinute: 100,
        rhythm: { weekday, weekend: new Array<number>(24).fill(0.25) },
      });

      // 2026-07-30 is a Thursday; 2026-08-01 is a Saturday.
      const thursday9am = new Date(2026, 6, 30, 9, 0, 0);
      const saturday9am = new Date(2026, 7, 1, 9, 0, 0);

      expect(driver.rhythmMultiplier(thursday9am)).toBe(3);
      expect(driver.effectiveRequestsPerMinute(thursday9am)).toBe(12);
      expect(driver.rhythmMultiplier(saturday9am)).toBe(0.25);
      expect(driver.effectiveRequestsPerMinute(saturday9am)).toBe(1);
    });

    it('clamps a rhythm spike to the hard cap', () => {
      const weekday = new Array<number>(24).fill(50);
      const { driver } = makeDriver({
        baselineRequestsPerMinute: 10,
        maxRequestsPerMinute: 30,
        rhythm: { weekday, weekend: weekday },
      });
      expect(driver.effectiveRequestsPerMinute(new Date(2026, 6, 30, 9))).toBe(30);
    });
  });

  describe('scheduled loop', () => {
    it('drives itself on a jittered interval when started', async () => {
      const { driver, calls } = makeDriver({
        baselineRequestsPerMinute: 6000,
        maxRequestsPerMinute: 6000,
      });
      driver.start();
      expect(driver.status().running).toBe(true);

      await wait(120);
      driver.stop();

      expect(calls.length).toBeGreaterThan(0);
      expect(driver.status().running).toBe(false);
      const before = calls.length;
      await wait(50);
      expect(calls.length).toBe(before);
    });
  });
});

describe('POST /__control/driver', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  const post = (body: object) =>
    request(harness.app.getHttpServer())
      .post('/__control/driver')
      .set('authorization', bearer(harness.token))
      .send(body);

  it('requires a valid mode and ttlSeconds', async () => {
    const res = await post({ mode: 'sideways', ttlSeconds: 60 }).expect(400);
    expect(res.body.errors.mode).toContain('baseline');
    await post({ mode: 'burst' }).expect(400);
    await post({ mode: 'burst', multiplier: 0, ttlSeconds: 60 }).expect(400);
  });

  it('switches mode and reports the override with its TTL', async () => {
    const res = await post({ mode: 'burst', multiplier: 4, ttlSeconds: 120 }).expect(201);
    expect(res.body.driver.mode).toBe('burst');
    expect(res.body.driver.multiplier).toBe(4);
    expect(res.body.driver.override.remainingSeconds).toBeGreaterThan(110);
    expect(res.body.baseline.driver).toBe(false);
    expect(harness.driver.getMode()).toBe('burst');
  });

  it('auto-reverts the driver override at TTL expiry', async () => {
    await post({ mode: 'paused', ttlSeconds: 1 }).expect(201);
    expect(harness.driver.getMode()).toBe('paused');

    await wait(1_200);

    expect(harness.driver.getMode()).toBe('baseline');
    expect(harness.control.state().driver.override).toBeNull();
    expect(harness.control.state().baseline.overall).toBe(true);
  });

  it('409s when the service has no driver configured', async () => {
    const receiveOnly = await createHarness({ noDriver: true });
    try {
      expect(receiveOnly.driver.isConfigured()).toBe(false);
      const res = await request(receiveOnly.app.getHttpServer())
        .post('/__control/driver')
        .set('authorization', bearer(receiveOnly.token))
        .send({ mode: 'paused', ttlSeconds: 60 })
        .expect(409);
      expect(res.body.error).toBe('driver_not_configured');
      expect(receiveOnly.control.state().driver.configured).toBe(false);
    } finally {
      await receiveOnly.close();
    }
  });
});
