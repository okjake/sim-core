import type { Request } from 'express';
/** Header the partner-api platform signs its webhook deliveries with. */
export declare const DEFAULT_WEBHOOK_SIGNATURE_HEADER = "x-partner-api-signature";
/**
 * Compute the signature for a payload: lowercase hex HMAC-SHA256 over the RAW
 * body bytes, prefixed `sha256=`.
 *
 * Exported because every receiver test needs to produce a valid signature, and
 * a hand-rolled one in each consumer repo is a hand-rolled bug in each consumer
 * repo.
 */
export declare function signPlatformWebhook(rawBody: Buffer, secret: string): string;
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
export declare function verifyPlatformWebhook(rawBody: Buffer, signatureHeader: string, secret: string): boolean;
/**
 * Pull the raw request body captured by Nest's `rawBody: true` option (or by a
 * `verify` callback on `express.json`). Returns null when nothing captured it —
 * which is the failure mode worth catching loudly, because re-serialising
 * `req.body` produces a *different byte sequence* and every signature check
 * would fail for reasons that look like a wrong secret.
 */
export declare function extractRawBody(req: Request): Buffer | null;
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
export declare function inspectWebhookRequest(req: Request, options: WebhookVerificationOptions): WebhookVerification;
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
export declare function assertPlatformWebhook(req: Request, options: WebhookVerificationOptions): {
    rawBody: Buffer;
    body: unknown;
};
