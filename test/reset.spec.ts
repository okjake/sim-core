import request from 'supertest';

import { bearer, createHarness, type TestHarness } from './helpers';

describe('POST /__control/reset', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  const auth = (req: request.Test) => req.set('authorization', bearer(harness.token));

  it('reverts chaos, the scenario and the driver override in one call', async () => {
    await auth(
      request(harness.app.getHttpServer())
        .post('/__control/scenario')
        .send({ scenario: 'outage', ttlSeconds: 3_600 }),
    ).expect(201);
    await auth(
      request(harness.app.getHttpServer())
        .post('/__control/driver')
        .send({ mode: 'burst', multiplier: 8, ttlSeconds: 3_600 }),
    ).expect(201);

    await request(harness.app.getHttpServer()).get('/widgets').expect(503);
    expect(harness.control.state().baseline.overall).toBe(false);

    const res = await auth(
      request(harness.app.getHttpServer()).post('/__control/reset'),
    ).expect(201);

    expect(res.body.baseline).toEqual({ chaos: true, driver: true, overall: true });
    expect(res.body.scenario).toBeNull();
    expect(res.body.chaos.rules).toEqual([]);
    expect(res.body.driver.mode).toBe('baseline');
    expect(res.body.driver.multiplier).toBe(1);
    expect(res.body.driver.override).toBeNull();

    await request(harness.app.getHttpServer()).get('/widgets').expect(200);
  });

  it('removes driver request mutators installed by a scenario', async () => {
    await auth(
      request(harness.app.getHttpServer())
        .post('/__control/scenario')
        .send({ scenario: 'bad-payloads', ttlSeconds: 3_600 }),
    ).expect(201);
    expect(harness.driver.status().requestMutators).toBe(1);

    await auth(request(harness.app.getHttpServer()).post('/__control/reset')).expect(201);
    expect(harness.driver.status().requestMutators).toBe(0);
  });

  it('is idempotent — resetting at baseline is a no-op', async () => {
    await auth(request(harness.app.getHttpServer()).post('/__control/reset')).expect(201);
    const res = await auth(
      request(harness.app.getHttpServer()).post('/__control/reset'),
    ).expect(201);
    expect(res.body.baseline.overall).toBe(true);
  });

  it('forces baseline even when a scenario revert function throws', async () => {
    harness.control['registry'].register({
      id: 'broken-revert',
      description: 'Installs chaos and then throws on revert.',
      apply: (ctx) => {
        ctx.chaos.apply({ reject: { status: 503 } });
        return () => {
          throw new Error('revert exploded');
        };
      },
    });

    await auth(
      request(harness.app.getHttpServer())
        .post('/__control/scenario')
        .send({ scenario: 'broken-revert', ttlSeconds: 3_600 }),
    ).expect(201);
    await request(harness.app.getHttpServer()).get('/widgets').expect(503);

    await auth(request(harness.app.getHttpServer()).post('/__control/reset')).expect(201);
    await request(harness.app.getHttpServer()).get('/widgets').expect(200);
    expect(harness.control.state().baseline.overall).toBe(true);
  });
});
