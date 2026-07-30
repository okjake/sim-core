import request from 'supertest';

import { bearer, createHarness, type TestHarness } from './helpers';

/** supertest's default JSON parser throws on deliberately-broken bodies. */
const rawParser = (
  res: NodeJS.ReadableStream & { setEncoding(enc: string): void },
  cb: (err: Error | null, body: string) => void,
): void => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (chunk: string) => {
    data += chunk;
  });
  res.on('end', () => cb(null, data));
};

describe('chaos primitives alter responses', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  const activate = (scenario: string, params: Record<string, unknown> = {}, ttlSeconds = 60) =>
    request(harness.app.getHttpServer())
      .post('/__control/scenario')
      .set('authorization', bearer(harness.token))
      .send({ scenario, params, ttlSeconds })
      .expect(201);

  it('baseline leaves responses untouched', async () => {
    const res = await request(harness.app.getHttpServer()).get('/widgets').expect(200);
    expect(res.body.count).toBe(3);
    expect(res.headers['x-sim-chaos']).toBeUndefined();
  });

  it('reject (outage) short-circuits the domain API with 503', async () => {
    await activate('outage');
    const res = await request(harness.app.getHttpServer()).get('/widgets').expect(503);
    expect(res.headers['x-sim-chaos']).toBe('reject');
    expect(res.body.error).toBe('sim_chaos_reject');
  });

  it('reject (auth-failure) short-circuits with 401', async () => {
    await activate('auth-failure');
    await request(harness.app.getHttpServer()).get('/widgets').expect(401);
  });

  it('never breaks its own kill switch: /__control and /health stay up during an outage', async () => {
    await activate('outage');
    await request(harness.app.getHttpServer()).get('/health').expect(200);
    await request(harness.app.getHttpServer())
      .get('/__control/state')
      .set('authorization', bearer(harness.token))
      .expect(200);
    await request(harness.app.getHttpServer()).get('/openapi.json').expect(200);
  });

  it('errorRate at 1.0 fails every request with the configured status', async () => {
    await activate('error-spike', { rate: 1, status: 502 });
    const res = await request(harness.app.getHttpServer()).get('/widgets').expect(502);
    expect(res.headers['x-sim-chaos']).toBe('error-rate');
  });

  it('errorRate at 0 fails nothing', async () => {
    await activate('error-spike', { rate: 0, status: 502 });
    await request(harness.app.getHttpServer()).get('/widgets').expect(200);
  });

  it('latency delays the response and publishes the applied delay as a header', async () => {
    await activate('latency', { baseMs: 120, jitterMs: 0 });
    const startedAt = Date.now();
    const res = await request(harness.app.getHttpServer()).get('/widgets').expect(200);
    const elapsed = Date.now() - startedAt;

    expect(res.headers['x-sim-chaos-latency-ms']).toBe('120');
    expect(res.headers['x-sim-chaos']).toContain('latency');
    expect(elapsed).toBeGreaterThanOrEqual(100);
    // Body still intact — latency alone must not corrupt the payload.
    expect(res.body.count).toBe(3);
  });

  it('latency jitter stays inside the configured window and is seeded', async () => {
    await activate('latency', { baseMs: 200, jitterMs: 100 });
    const delays: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(harness.app.getHttpServer()).get('/widgets').expect(200);
      delays.push(Number(res.headers['x-sim-chaos-latency-ms']));
    }
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(150);
      expect(delay).toBeLessThanOrEqual(250);
    }
    expect(new Set(delays).size).toBeGreaterThan(1);
  });

  it('pathPrefix scopes chaos to matching routes only', async () => {
    await activate('outage', { pathPrefix: '/widgets/orders' });
    await request(harness.app.getHttpServer()).get('/widgets').expect(200);
    await request(harness.app.getHttpServer())
      .post('/widgets/orders')
      .send({ widgetId: 'w-1' })
      .expect(503);
  });

  describe('malformedResponse', () => {
    const applyMalformed = (mode: string) =>
      harness.chaos.apply({ malformedResponse: { mode: mode as never } });

    it('drop-fields removes keys from the payload', async () => {
      applyMalformed('drop-fields');
      const res = await request(harness.app.getHttpServer()).get('/widgets').expect(200);
      expect(res.headers['x-sim-chaos-malformed']).toBe('drop-fields');
      expect(Object.keys(res.body).length).toBeLessThan(2);
    });

    it('wrong-types swaps value types', async () => {
      applyMalformed('wrong-types');
      const res = await request(harness.app.getHttpServer()).get('/widgets/w-1').expect(200);
      expect(res.headers['x-sim-chaos-malformed']).toBe('wrong-types');
      expect(typeof res.body.price).toBe('string');
      expect(typeof res.body.name).toBe('number');
      expect(typeof res.body.inStock).toBe('string');
    });

    it('truncate returns unparseable JSON', async () => {
      applyMalformed('truncate');
      const res = await request(harness.app.getHttpServer())
        .get('/widgets')
        .buffer(true)
        .parse(rawParser as never)
        .expect(200);

      expect(res.headers['x-sim-chaos-malformed']).toBe('truncate');
      const raw = res.body as unknown as string;
      expect(raw.length).toBeGreaterThan(0);
      expect(() => JSON.parse(raw) as unknown).toThrow();
    });
  });

  it('records applied chaos on the request tail', async () => {
    await activate('outage');
    await request(harness.app.getHttpServer()).get('/widgets').expect(503);

    const res = await request(harness.app.getHttpServer())
      .get('/__control/requests?limit=10')
      .set('authorization', bearer(harness.token))
      .expect(200);

    const entry = res.body.requests.find(
      (r: { path: string; method: string }) => r.path === '/widgets' && r.method === 'GET',
    );
    expect(entry).toMatchObject({ status: 503, chaos: ['reject'] });
    expect(typeof entry.latencyMs).toBe('number');
  });
});
