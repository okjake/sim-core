import { Logger } from '@nestjs/common';
import request from 'supertest';

import { bearer, createHarness, type TestHarness } from './helpers';

describe('__control auth', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  const routes: Array<[string, string]> = [
    ['get', '/__control/state'],
    ['get', '/__control/scenarios'],
    ['get', '/__control/requests'],
    ['post', '/__control/scenario'],
    ['post', '/__control/driver'],
    ['post', '/__control/reset'],
  ];

  const send = (method: string, path: string): request.Test => {
    const agent = request(harness.app.getHttpServer()) as unknown as Record<
      string,
      (p: string) => request.Test
    >;
    return (agent[method] as (p: string) => request.Test)(path);
  };

  it.each(routes)('401s %s %s without a token', async (method, path) => {
    const res = await send(method, path).send({});
    expect(res.status).toBe(401);
  });

  it.each(routes)('401s %s %s with the wrong token', async (method, path) => {
    const res = await send(method, path)
      .set('authorization', bearer('nope-nope-nope-nope-nope'))
      .send({});
    expect(res.status).toBe(401);
  });

  it('401s on a non-bearer scheme', async () => {
    await request(harness.app.getHttpServer())
      .get('/__control/state')
      .set('authorization', `Basic ${harness.token}`)
      .expect(401);
  });

  /**
   * A silent 401 here is close to undiagnosable: the admin SPA answers one by
   * re-authenticating, so the operator sees a reloading page and finds nothing
   * in the service logs to explain it. The reason has to reach the log.
   */
  describe('rejection logging', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warn.mockRestore();
    });

    const warnings = (): string =>
      warn.mock.calls.map((args) => String(args[0])).join('\n');

    // This harness runs with adminAuth OFF, which is the more useful thing to
    // report than "you sent no cookie": on a service without the gate, no
    // browser session can ever authorize /__control, so a missing cookie is a
    // symptom and the disabled gate is the cause.
    it('names the disabled gate when no credential was presented', async () => {
      await request(harness.app.getHttpServer()).get('/__control/state').expect(401);
      expect(warnings()).toContain('adminAuth is not enabled');
    });

    it('distinguishes a bad bearer from a missing one', async () => {
      await request(harness.app.getHttpServer())
        .get('/__control/state')
        .set('authorization', bearer('nope-nope-nope-nope-nope'))
        .expect(401);
      expect(warnings()).toContain('did not match CONTROL_TOKEN');
    });

    it('still names the gate when a cookie is sent to an ungated service', async () => {
      await request(harness.app.getHttpServer())
        .get('/__control/state')
        .set('cookie', 'sim_admin_session=whatever')
        .expect(401);
      expect(warnings()).toContain('adminAuth is not enabled');
    });

    it('never logs the presented credential', async () => {
      await request(harness.app.getHttpServer())
        .get('/__control/state')
        .set('authorization', bearer('super-secret-value-do-not-log'))
        .set('cookie', 'sim_admin_session=cookie-secret-do-not-log')
        .expect(401);
      expect(warnings()).not.toContain('super-secret-value-do-not-log');
      expect(warnings()).not.toContain('cookie-secret-do-not-log');
    });
  });

  it('allows GET /__control/state with the right token', async () => {
    const res = await request(harness.app.getHttpServer())
      .get('/__control/state')
      .set('authorization', bearer(harness.token))
      .expect(200);

    expect(res.body.service.name).toBe('demo');
    expect(res.body.scenario).toBeNull();
    expect(res.body.baseline.overall).toBe(true);
  });

  it('lists the built-in scenarios plus consumer scenarios', async () => {
    const res = await request(harness.app.getHttpServer())
      .get('/__control/scenarios')
      .set('authorization', bearer(harness.token))
      .expect(200);

    const ids = res.body.scenarios.map((s: { id: string }) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'latency',
        'error-spike',
        'outage',
        'auth-failure',
        'bad-payloads',
      ]),
    );
    const latency = res.body.scenarios.find((s: { id: string }) => s.id === 'latency');
    expect(latency.params.fields.baseMs).toMatchObject({ type: 'number', default: 750 });
  });

  it('does not require a token for the domain API or /health', async () => {
    await request(harness.app.getHttpServer()).get('/health').expect(200);
    await request(harness.app.getHttpServer()).get('/widgets').expect(200);
  });
});
