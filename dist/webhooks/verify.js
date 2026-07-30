"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_WEBHOOK_SIGNATURE_HEADER = void 0;
exports.signPlatformWebhook = signPlatformWebhook;
exports.verifyPlatformWebhook = verifyPlatformWebhook;
exports.extractRawBody = extractRawBody;
exports.inspectWebhookRequest = inspectWebhookRequest;
exports.assertPlatformWebhook = assertPlatformWebhook;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
/** Header the partner-api platform signs its webhook deliveries with. */
exports.DEFAULT_WEBHOOK_SIGNATURE_HEADER = 'x-partner-api-signature';
/**
 * Compute the signature for a payload: lowercase hex HMAC-SHA256 over the RAW
 * body bytes, prefixed `sha256=`.
 *
 * Exported because every receiver test needs to produce a valid signature, and
 * a hand-rolled one in each consumer repo is a hand-rolled bug in each consumer
 * repo.
 */
function signPlatformWebhook(rawBody, secret) {
    return `sha256=${(0, node_crypto_1.createHmac)('sha256', secret).update(rawBody).digest('hex')}`;
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
function verifyPlatformWebhook(rawBody, signatureHeader, secret) {
    if (!Buffer.isBuffer(rawBody) || typeof signatureHeader !== 'string' || !secret) {
        return false;
    }
    const provided = signatureHeader.trim().replace(/^sha256=/i, '');
    if (!/^[0-9a-fA-F]+$/.test(provided)) {
        return false;
    }
    const expected = (0, node_crypto_1.createHmac)('sha256', secret).update(rawBody).digest('hex');
    const providedBuf = Buffer.from(provided.toLowerCase(), 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (providedBuf.length !== expectedBuf.length) {
        return false;
    }
    return (0, node_crypto_1.timingSafeEqual)(providedBuf, expectedBuf);
}
/**
 * Pull the raw request body captured by Nest's `rawBody: true` option (or by a
 * `verify` callback on `express.json`). Returns null when nothing captured it —
 * which is the failure mode worth catching loudly, because re-serialising
 * `req.body` produces a *different byte sequence* and every signature check
 * would fail for reasons that look like a wrong secret.
 */
function extractRawBody(req) {
    const candidate = req.rawBody;
    if (Buffer.isBuffer(candidate))
        return candidate;
    if (typeof candidate === 'string')
        return Buffer.from(candidate, 'utf8');
    if (Buffer.isBuffer(req.body))
        return req.body;
    return null;
}
/** Non-throwing verification of an inbound Express request. */
function inspectWebhookRequest(req, options) {
    const header = options.signatureHeader ?? exports.DEFAULT_WEBHOOK_SIGNATURE_HEADER;
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
function assertPlatformWebhook(req, options) {
    const result = inspectWebhookRequest(req, options);
    if (!result.verified || !result.rawBody) {
        throw new common_1.UnauthorizedException({
            error: 'invalid_webhook_signature',
            message: result.reason === 'no-raw-body'
                ? 'Raw request body was not captured — create the app with `{ rawBody: true }`'
                : 'Webhook signature verification failed',
            reason: result.reason,
        });
    }
    let body = req.body;
    if (body === undefined || Buffer.isBuffer(body)) {
        try {
            body = JSON.parse(result.rawBody.toString('utf8'));
        }
        catch {
            body = null;
        }
    }
    return { rawBody: result.rawBody, body };
}
