import { UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/** Header the partner-api platform signs its webhook deliveries with. */
export const DEFAULT_WEBHOOK_SIGNATURE_HEADER = 'x-partner-api-signature';

/**
 * Compute the signature for a payload: lowercase hex HMAC-SHA256 over the RAW
 * body bytes, prefixed `sha256=`.
 *
 * Exported because every receiver test needs to produce a valid signature, and
 * a hand-rolled one in each consumer repo is a hand-rolled bug in each consumer
 * repo.
 */
export function signPlatformWebhook(rawBody: Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/**
 * Verify a platform webhook signature.
 *
 * HMAC-SHA256 over the raw body, compared in constant time. Accepts either
 * `sha256=<hex>` or a bare `<hex>` header value.
 *
 * The length check before `timingSafeEqual` is not optional — the function
 * throws on unequal-length buffers, so without it a malformed header is a 500
 * instead of a 401. Both operands are hashed to a fixed 64-char hex string
 * before comparison anyway, so length only ever differs when the header is
 * junk, and a junk header does not deserve constant-time treatment beyond not
 * crashing.
 */
export function verifyPlatformWebhook(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!Buffer.isBuffer(rawBody) || typeof signatureHeader !== 'string' || !secret) {
    return false;
  }

  const provided = signatureHeader.trim().replace(/^sha256=/i, '');
  if (!/^[0-9a-fA-F]+$/.test(provided)) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const providedBuf = Buffer.from(provided.toLowerCase(), 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');

  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Pull the raw request body captured by Nest's `rawBody: true` option (or by a
 * `verify` callback on `express.json`). Returns null when nothing captured it —
 * which is the failure mode worth catching loudly, because re-serialising
 * `req.body` produces a *different byte sequence* and every signature check
 * would fail for reasons that look like a wrong secret.
 */
export function extractRawBody(req: Request): Buffer | null {
  const candidate = (req as Request & { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(candidate)) return candidate;
  if (typeof candidate === 'string') return Buffer.from(candidate, 'utf8');
  if (Buffer.isBuffer(req.body)) return req.body;
  return null;
}

export interface WebhookVerificationOptions {
  secret: string;
  /** Default `x-partner-api-signature`. */
  signatureHeader?: string;
}

export interface WebhookVerification {
  verified: boolean;
  rawBody: Buffer | null;
  signature: string | null;
  reason: 'ok' | 'no-raw-body' | 'missing-signature' | 'bad-signature' | 'no-secret';
}

/** Non-throwing verification of an inbound Express request. */
export function inspectWebhookRequest(
  req: Request,
  options: WebhookVerificationOptions,
): WebhookVerification {
  const header = options.signatureHeader ?? DEFAULT_WEBHOOK_SIGNATURE_HEADER;
  const raw = req.headers[header.toLowerCase()];
  const signature = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
  const rawBody = extractRawBody(req);

  if (!options.secret) {
    return { verified: false, rawBody, signature, reason: 'no-secret' };
  }
  if (!rawBody) {
    return { verified: false, rawBody: null, signature, reason: 'no-raw-body' };
  }
  if (!signature) {
    return { verified: false, rawBody, signature: null, reason: 'missing-signature' };
  }
  if (!verifyPlatformWebhook(rawBody, signature, options.secret)) {
    return { verified: false, rawBody, signature, reason: 'bad-signature' };
  }
  return { verified: true, rawBody, signature, reason: 'ok' };
}

/**
 * Verify or throw 401. The one-liner a receiver controller wants.
 *
 * ```ts
 * @Post('webhooks/partner-api')
 * receive(@Req() req: Request) {
 *   const { body } = assertPlatformWebhook(req, { secret: process.env.WEBHOOK_SECRET! });
 *   this.recorder.record({ path: '/webhooks/partner-api', verified: true, body });
 *   return { received: true };            // respond fast, process later
 * }
 * ```
 */
export function assertPlatformWebhook(
  req: Request,
  options: WebhookVerificationOptions,
): { rawBody: Buffer; body: unknown } {
  const result = inspectWebhookRequest(req, options);
  if (!result.verified || !result.rawBody) {
    throw new UnauthorizedException({
      error: 'invalid_webhook_signature',
      message:
        result.reason === 'no-raw-body'
          ? 'Raw request body was not captured — create the app with `{ rawBody: true }`'
          : 'Webhook signature verification failed',
      reason: result.reason,
    });
  }

  let body: unknown = req.body;
  if (body === undefined || Buffer.isBuffer(body)) {
    try {
      body = JSON.parse(result.rawBody.toString('utf8'));
    } catch {
      body = null;
    }
  }

  return { rawBody: result.rawBody, body };
}
