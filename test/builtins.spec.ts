import request from 'supertest';

import {
  REQUEST_TAIL_CAPACITY,
  RequestTailService,
  createRng,
  normalizeSimCoreConfig,
  p,
  resolveAdminDist,
} from '../src';
import { createDemoConfig } from '../examples/demo/demo.config';
import { bearer, createHarness, type TestHarness } from './helpers';

describe('built-in routes', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('GET /health', () => {
    it('returns status, uptime and version', async () => {
      const res = await request(harness.app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toEqual({
        status: 'ok',
        uptime: expect.any(Number),
        version: '0.1.0',
      });
    });
  });

  describe('GET /openapi.json', () => {
    it('serves the configured document with ETag + Last-Modified', async () => {
      const res = await request(harness.app.getHttpServer()).get('/openapi.json').expect(200);
      expect(res.body.info.title).toBe('Demo Widgets API');
      expect(res.headers.etag).toMatch(/^"[0-9a-f]{32}"$/);
      expect(res.headers['last-modified']).toBeDefined();
      expect(new Date(res.headers['last-modified'] as string).toString()).not.toBe(
        'Invalid Date',
      );
    });

    it('excludes /__control paths from the published spec', async () => {
      const res = await request(harness.app.getHttpServer()).get('/openapi.json').expect(200);
      expect(Object.keys(res.body.paths)).toEqual([
        '/widgets',
        '/widgets/{id}',
        '/widgets/orders',
      ]);
    });

    it('returns 304 for a matching If-None-Match', async () => {
      const first = await request(harness.app.getHttpServer()).get('/openapi.json').expect(200);
      await request(harness.app.getHttpServer())
        .get('/openapi.json')
        .set('if-none-match', first.headers.etag as string)
        .expect(304);
    });
  });

  describe('GET /admin', () => {
    it('serves the built SPA when dist/public is present', async () => {
      if (!resolveAdminDist()) {
        // Running from source before `pnpm build:admin` — nothing to serve.
        return;
      }
      const res = await request(harness.app.getHttpServer()).get('/admin/').expect(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<div id="root">');
      await request(harness.app.getHttpServer())
        .get('/admin/assets/admin.js')
        .expect(200);
    });
  });

  describe('GET /__admin/brand', () => {
    it('exposes display-only branding without a token', async () => {
      const res = await request(harness.app.getHttpServer()).get('/__admin/brand').expect(200);
      expect(res.body).toEqual({
        name: 'demo',
        version: '0.1.0',
        brand: {
          displayName: 'Demo Widgets Co.',
          color: '#4f46e5',
          tagline: 'Widgets, sincerely',
        },
        driver: true,
        docs: false,
      });
    });
  });

  describe('request tail', () => {
    it('records method, path, status and latency for every request', async () => {
      await request(harness.app.getHttpServer()).get('/widgets').expect(200);
      await request(harness.app.getHttpServer()).get('/nope').expect(404);

      const res = await request(harness.app.getHttpServer())
        .get('/__control/requests?limit=5')
        .set('authorization', bearer(harness.token))
        .expect(200);

      const paths = res.body.requests.map((r: { path: string }) => r.path);
      expect(paths).toContain('/nope');
      const notFound = res.body.requests.find((r: { path: string }) => r.path === '/nope');
      expect(notFound).toMatchObject({ method: 'GET', status: 404 });
      expect(notFound.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('is a bounded ring buffer, newest first', () => {
      const tail = new RequestTailService(3);
      for (let i = 1; i <= 10; i += 1) {
        tail.record({ method: 'GET', path: `/p${i}`, status: 200, latencyMs: i });
      }
      expect(tail.size()).toBe(3);
      expect(tail.list().map((e) => e.path)).toEqual(['/p10', '/p9', '/p8']);
      expect(REQUEST_TAIL_CAPACITY).toBe(200);
    });
  });
});

describe('config validation', () => {
  it('rejects a missing or short control token', () => {
    expect(() =>
      normalizeSimCoreConfig({ ...createDemoConfig(), controlToken: 'short' }),
    ).toThrow(/controlToken/);
  });

  it('rejects a driver without a base URL', () => {
    const config = createDemoConfig();
    config.driver!.baseUrl = '';
    expect(() => normalizeSimCoreConfig(config)).toThrow(/baseUrl/);
  });

  it('rejects a non-positive hard cap', () => {
    const config = createDemoConfig();
    config.driver!.maxRequestsPerMinute = 0;
    expect(() => normalizeSimCoreConfig(config)).toThrow(/maxRequestsPerMinute/);
  });

  it('applies defaults', () => {
    const config = normalizeSimCoreConfig(createDemoConfig());
    expect(config.requestTailSize).toBe(200);
    expect(config.admin).toBe(true);
  });
});

describe('seeded rng', () => {
  it('is reproducible and independent per derived stream', () => {
    const a = createRng('abc');
    const b = createRng('abc');
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBe(8);
    expect(createRng('abc').derive('x').next()).not.toBe(createRng('abc').derive('y').next());
  });

  it('weightedPick honours weights', () => {
    const rng = createRng(7);
    const items = [
      { id: 'a', w: 9 },
      { id: 'b', w: 1 },
    ];
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i += 1) {
      counts[rng.weightedPick(items, (item) => item.w).id as 'a' | 'b'] += 1;
    }
    expect(counts.a).toBeGreaterThan(counts.b * 4);
  });
});

describe('param schemas', () => {
  it('parses, defaults and validates', () => {
    const schema = p.object({
      rate: p.number({ min: 0, max: 1 }).default(0.5),
      label: p.string().optional(),
      mode: p.enum(['a', 'b'] as const).default('a'),
    });

    expect(schema.parse({})).toEqual({ rate: 0.5, mode: 'a' });
    expect(schema.parse({ rate: 0.9, label: 'x', mode: 'b' })).toEqual({
      rate: 0.9,
      label: 'x',
      mode: 'b',
    });
    expect(() => schema.parse({ rate: 2 })).toThrow(/rate/);
    expect(() => schema.parse({ mode: 'z' })).toThrow(/mode/);
    expect(schema.describe().fields?.rate).toMatchObject({ type: 'number', default: 0.5 });
  });
});
