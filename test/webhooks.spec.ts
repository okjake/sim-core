import { createHmac, randomBytes } from 'node:crypto';
import request from 'supertest';

import {
  DEFAULT_WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_RECORDER_CAPACITY,
  WebhookRecorderService,
  signPlatformWebhook,
  verifyPlatformWebhook,
} from '../src';
import { DEMO_WEBHOOK_SECRET } from '../examples/demo/webhooks.controller';
import { bearer, createHarness, type TestHarness } from './helpers';

const SECRET = 'a-webhook-secret-value';
const body = (value: unknown): Buffer => Buffer.from(JSON.stringify(value), 'utf8');

describe('verifyPlatformWebhook', () => {
  const payload = body({ event: 'integration.breaking_change', id: 'evt_1' });
  const hex = createHmac('sha256', SECRET).update(payload).digest('hex');

  it('accepts a correct signature, with or without the sha256= prefix', () => {
    expect(verifyPlatformWebhook(payload, `sha256=${hex}`, SECRET)).toBe(true);
    expect(verifyPlatformWebhook(payload, hex, SECRET)).toBe(true);
    expect(verifyPlatformWebhook(payload, `SHA256=${hex.toUpperCase()}`, SECRET)).toBe(true);
    expect(verifyPlatformWebhook(payload, `  sha256=${hex}  `, SECRET)).toBe(true);
  });

  it('round-trips with signPlatformWebhook', () => {
    expect(verifyPlatformWebhook(payload, signPlatformWebhook(payload, SECRET), SECRET)).toBe(
      true,
    );
    expect(signPlatformWebhook(payload, SECRET)).toBe(`sha256=${hex}`);
  });

  it('rejects a wrong signature of the correct length', () => {
    const flipped = `${hex.slice(0, -1)}${hex.endsWith('a') ? 'b' : 'a'}`;
    expect(flipped).toHaveLength(hex.length);
    expect(verifyPlatformWebhook(payload, flipped, SECRET)).toBe(false);
  });

  it('rejects a signature computed with a different secret', () => {
    const other = createHmac('sha256', 'not-the-secret').update(payload).digest('hex');
    expect(verifyPlatformWebhook(payload, other, SECRET)).toBe(false);
  });

  it('rejects when the body differs by a single byte', () => {
    expect(verifyPlatformWebhook(body({ event: 'integration.breaking_change', id: 'evt_2' }), hex, SECRET)).toBe(
      false,
    );
  });

  describe('length mismatch', () => {
    // timingSafeEqual THROWS on unequal-length buffers. Without the length
    // guard each of these would be a 500 instead of a 401.
    it.each([
      ['empty', ''],
      ['too short', hex.slice(0, 32)],
      ['too long', `${hex}00`],
      ['prefix only', 'sha256='],
      ['one char', 'a'],
    ])('returns false for a %s signature without throwing', (_label, signature) => {
      expect(() => verifyPlatformWebhook(payload, signature, SECRET)).not.toThrow();
      expect(verifyPlatformWebhook(payload, signature, SECRET)).toBe(false);
    });

    it('returns false for a non-hex signature of the right length', () => {
      const nonHex = 'z'.repeat(64);
      expect(verifyPlatformWebhook(payload, nonHex, SECRET)).toBe(false);
    });
  });

  it('rejects malformed inputs rather than throwing', () => {
    expect(verifyPlatformWebhook(payload, hex, '')).toBe(false);
    expect(verifyPlatformWebhook(payload, undefined as never, SECRET)).toBe(false);
    expect(verifyPlatformWebhook('not a buffer' as never, hex, SECRET)).toBe(false);
  });

  it('compares in constant time for equal-length candidates', () => {
    // Not a timing measurement — those are hopelessly flaky in CI. This asserts
    // the property that makes constant-time comparison possible: every
    // equal-length wrong signature takes the same code path and returns false,
    // whether it diverges in the first nibble or the last.
    const first = `f${hex.slice(1)}` === hex ? `0${hex.slice(1)}` : `f${hex.slice(1)}`;
    const last = `${hex.slice(0, -1)}f` === hex ? `${hex.slice(0, -1)}0` : `${hex.slice(0, -1)}f`;
    expect(verifyPlatformWebhook(payload, first, SECRET)).toBe(false);
    expect(verifyPlatformWebhook(payload, last, SECRET)).toBe(false);

    for (let i = 0; i < 50; i += 1) {
      const random = randomBytes(32).toString('hex');
      expect(random).toHaveLength(hex.length);
      expect(verifyPlatformWebhook(payload, random, SECRET)).toBe(false);
    }
  });
});

describe('WebhookRecorderService', () => {
  it('is a bounded ring buffer, newest first', () => {
    const recorder = new WebhookRecorderService(3);
    for (let i = 1; i <= 10; i += 1) {
      recorder.record({ path: '/w', verified: true, body: { n: i } });
    }
    expect(recorder.size()).toBe(3);
    expect(recorder.list().map((e) => (e.body as { n: number }).n)).toEqual([10, 9, 8]);
    expect(WEBHOOK_RECORDER_CAPACITY).toBe(50);
  });

  it('sniffs the event type from common body shapes', () => {
    const recorder = new WebhookRecorderService();
    expect(recorder.record({ path: '/w', verified: true, body: { event: 'a' } }).event).toBe('a');
    expect(recorder.record({ path: '/w', verified: true, body: { type: 'b' } }).event).toBe('b');
    expect(
      recorder.record({ path: '/w', verified: true, body: { event_type: 'c' } }).event,
    ).toBe('c');
    expect(recorder.record({ path: '/w', verified: true, body: { x: 1 } }).event).toBeNull();
    expect(recorder.record({ path: '/w', verified: true, event: 'forced' }).event).toBe('forced');
  });

  it('records rejected deliveries too, with a default 401', () => {
    const recorder = new WebhookRecorderService();
    expect(recorder.record({ path: '/w', verified: false })).toMatchObject({
      verified: false,
      status: 401,
    });
  });

  it('truncates oversized bodies', () => {
    const recorder = new WebhookRecorderService();
    const entry = recorder.record({
      path: '/w',
      verified: true,
      body: { blob: 'x'.repeat(10_000) },
    });
    expect(entry.body).toMatchObject({ truncated: true });
  });

  it('survives an unserializable body', () => {
    const recorder = new WebhookRecorderService();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(recorder.record({ path: '/w', verified: true, body: circular }).body).toEqual({
      unserializable: true,
    });
  });
});

describe('webhook receiver (end to end)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness({ rawBody: true });
  });

  afterEach(async () => {
    await harness.close();
  });

  const send = (payload: unknown, signature?: string): request.Test => {
    const raw = body(payload);
    const req = request(harness.app.getHttpServer())
      .post('/webhooks/platform')
      .set('content-type', 'application/json');
    if (signature !== undefined) {
      req.set(DEFAULT_WEBHOOK_SIGNATURE_HEADER, signature);
    }
    return req.send(raw.toString('utf8'));
  };

  it('accepts a correctly signed delivery and records it', async () => {
    const payload = { event: 'integration.breaking_change', id: 'evt_9' };
    await send(payload, signPlatformWebhook(body(payload), DEMO_WEBHOOK_SECRET)).expect(200);

    const res = await request(harness.app.getHttpServer())
      .get('/__control/webhooks')
      .set('authorization', bearer(harness.token))
      .expect(200);

    expect(res.body.webhooks).toHaveLength(1);
    expect(res.body.webhooks[0]).toMatchObject({
      path: '/webhooks/platform',
      verified: true,
      status: 200,
      event: 'integration.breaking_change',
    });
    expect(res.body.webhooks[0].body).toEqual(payload);
  });

  it('401s a bad signature and still records the attempt', async () => {
    await send({ event: 'x' }, 'sha256=deadbeef').expect(401);

    const res = await request(harness.app.getHttpServer())
      .get('/__control/webhooks')
      .set('authorization', bearer(harness.token))
      .expect(200);
    expect(res.body.webhooks[0]).toMatchObject({ verified: false, status: 401 });
  });

  it('401s a missing signature header', async () => {
    await send({ event: 'x' }).expect(401);
  });

  it('401s a signature over a different body', async () => {
    await send(
      { event: 'tampered' },
      signPlatformWebhook(body({ event: 'original' }), DEMO_WEBHOOK_SECRET),
    ).expect(401);
  });

  it('401s with reason no-raw-body when the app was not created with rawBody', async () => {
    const noRaw = await createHarness();
    const payload = { event: 'x' };
    const res = await request(noRaw.app.getHttpServer())
      .post('/webhooks/platform')
      .set('content-type', 'application/json')
      .set(
        DEFAULT_WEBHOOK_SIGNATURE_HEADER,
        signPlatformWebhook(body(payload), DEMO_WEBHOOK_SECRET),
      )
      .send(JSON.stringify(payload))
      .expect(401);
    expect(res.body.reason).toBe('no-raw-body');
    expect(res.body.message).toMatch(/rawBody/);
    await noRaw.close();
  });
});

describe('GET /__control/webhooks', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('requires the control bearer token', async () => {
    await request(harness.app.getHttpServer()).get('/__control/webhooks').expect(401);
    await request(harness.app.getHttpServer())
      .get('/__control/webhooks')
      .set('authorization', 'Bearer nope')
      .expect(401);
  });

  it('is available on a docs-disabled service and reports capacity', async () => {
    const res = await request(harness.app.getHttpServer())
      .get('/__control/webhooks')
      .set('authorization', bearer(harness.token))
      .expect(200);
    expect(res.body).toEqual({ capacity: 50, size: 0, webhooks: [] });
  });

  it('honours ?limit=', async () => {
    for (let i = 0; i < 5; i += 1) {
      harness.webhooks.record({ path: '/w', verified: true, body: { n: i } });
    }
    const res = await request(harness.app.getHttpServer())
      .get('/__control/webhooks?limit=2')
      .set('authorization', bearer(harness.token))
      .expect(200);
    expect(res.body.webhooks).toHaveLength(2);
    expect(res.body.size).toBe(5);
    harness.webhooks.clear();
  });
});
