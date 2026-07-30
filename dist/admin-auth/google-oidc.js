"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleJwksCache = void 0;
exports.decodeJwt = decodeJwt;
exports.verifyGoogleIdToken = verifyGoogleIdToken;
const node_crypto_1 = require("node:crypto");
const admin_auth_config_1 = require("./admin-auth.config");
const admin_auth_types_1 = require("./admin-auth.types");
function decodeSegment(segment) {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}
/** Split and decode without verifying anything. Never act on the result directly. */
function decodeJwt(token) {
    const parts = token.split('.');
    const [headerB64, claimsB64, signatureB64] = parts;
    if (parts.length !== 3 || !headerB64 || !claimsB64 || !signatureB64) {
        throw new admin_auth_types_1.AdminAuthError('malformed_id_token', 'id_token is not a three-part JWS');
    }
    let header;
    let claims;
    try {
        header = decodeSegment(headerB64);
        claims = decodeSegment(claimsB64);
    }
    catch {
        throw new admin_auth_types_1.AdminAuthError('malformed_id_token', 'id_token header or payload is not JSON');
    }
    if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object') {
        throw new admin_auth_types_1.AdminAuthError('malformed_id_token', 'id_token header or payload is not an object');
    }
    return {
        header,
        claims,
        signingInput: `${headerB64}.${claimsB64}`,
        signature: Buffer.from(signatureB64, 'base64url'),
    };
}
/**
 * Google's signing keys, cached by `kid`.
 *
 * Google rotates these every few days and publishes both the outgoing and
 * incoming key, so a TTL-based cache is correct as long as an unknown `kid`
 * triggers a refresh — which it does, rate-limited so a stream of tokens with
 * junk kids cannot turn this service into a load generator pointed at Google.
 */
class GoogleJwksCache {
    jwksUri;
    ttlSeconds;
    fetchImpl;
    now;
    keys = new Map();
    expiresAt = 0;
    lastFetchAt = 0;
    inflight = null;
    /** Refresh floor for the unknown-kid path. */
    minRefreshIntervalMs = 60_000;
    constructor(jwksUri, ttlSeconds, fetchImpl, now = Date.now) {
        this.jwksUri = jwksUri;
        this.ttlSeconds = ttlSeconds;
        this.fetchImpl = fetchImpl;
        this.now = now;
    }
    /** Test/introspection helper — how many keys are currently cached. */
    size() {
        return this.keys.size;
    }
    async getKey(kid) {
        if (this.keys.size === 0 || this.now() >= this.expiresAt) {
            await this.refresh();
        }
        const cached = this.keys.get(kid);
        if (cached)
            return cached;
        // Unknown kid: probably a rotation we have not seen. Refetch once, but not
        // more often than the floor.
        if (this.now() - this.lastFetchAt >= this.minRefreshIntervalMs) {
            await this.refresh();
            const refreshed = this.keys.get(kid);
            if (refreshed)
                return refreshed;
        }
        throw new admin_auth_types_1.AdminAuthError('unknown_key', `no JWKS key matches kid ${kid}`);
    }
    async refresh() {
        // Collapse concurrent misses into one request.
        this.inflight ??= this.doRefresh().finally(() => {
            this.inflight = null;
        });
        await this.inflight;
    }
    async doRefresh() {
        this.lastFetchAt = this.now();
        let body;
        try {
            const res = await this.fetchImpl(this.jwksUri, {
                method: 'GET',
                headers: { accept: 'application/json' },
            });
            if (!res.ok) {
                throw new Error(`status ${res.status}`);
            }
            body = await res.text();
        }
        catch (error) {
            throw new admin_auth_types_1.AdminAuthError('jwks_unavailable', `could not fetch ${this.jwksUri}: ${error instanceof Error ? error.message : String(error)}`);
        }
        let parsed;
        try {
            parsed = JSON.parse(body);
        }
        catch {
            throw new admin_auth_types_1.AdminAuthError('jwks_unavailable', 'JWKS response was not JSON');
        }
        if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
            throw new admin_auth_types_1.AdminAuthError('jwks_unavailable', 'JWKS response contained no keys');
        }
        const next = new Map();
        for (const jwk of parsed.keys) {
            if (!jwk?.kid || jwk.kty !== 'RSA' || !jwk.n || !jwk.e)
                continue;
            if (jwk.alg && jwk.alg !== 'RS256')
                continue;
            try {
                next.set(jwk.kid, (0, node_crypto_1.createPublicKey)({ key: jwk, format: 'jwk' }));
            }
            catch {
                // A single unusable key must not poison the whole set.
                continue;
            }
        }
        if (next.size === 0) {
            throw new admin_auth_types_1.AdminAuthError('jwks_unavailable', 'JWKS response contained no usable RSA keys');
        }
        this.keys = next;
        this.expiresAt = this.now() + this.ttlSeconds * 1000;
    }
}
exports.GoogleJwksCache = GoogleJwksCache;
/**
 * Verify signature first, then issuer, audience, lifetime and nonce.
 *
 * Returns the claims only if every check passed; throws an
 * {@link AdminAuthError} carrying a machine-readable reason otherwise. The
 * caller logs the reason and shows a generic 403.
 */
async function verifyGoogleIdToken(idToken, options) {
    const nowMs = (options.now ?? Date.now)();
    const nowSeconds = Math.floor(nowMs / 1000);
    const skew = options.clockSkewSeconds;
    const { header, claims, signingInput, signature } = decodeJwt(idToken);
    // `alg: none` and a symmetric alg (where the "key" would be public JWKS
    // material) are the two classic JWT forgeries. Only RS256 is accepted.
    if (header.alg !== 'RS256') {
        throw new admin_auth_types_1.AdminAuthError('bad_algorithm', `unexpected id_token alg ${String(header.alg)}`);
    }
    if (!header.kid) {
        throw new admin_auth_types_1.AdminAuthError('malformed_id_token', 'id_token header has no kid');
    }
    const key = await options.jwks.getKey(header.kid);
    const signatureValid = (0, node_crypto_1.verify)('RSA-SHA256', Buffer.from(signingInput, 'utf8'), key, signature);
    if (!signatureValid) {
        throw new admin_auth_types_1.AdminAuthError('bad_signature', 'id_token signature did not verify');
    }
    if (typeof claims.iss !== 'string' ||
        !admin_auth_config_1.GOOGLE_ISSUERS.includes(claims.iss)) {
        throw new admin_auth_types_1.AdminAuthError('bad_issuer', `unexpected iss ${String(claims.iss)}`);
    }
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(options.clientId)) {
        throw new admin_auth_types_1.AdminAuthError('bad_audience', 'id_token aud is not this client');
    }
    if (typeof claims.exp !== 'number' || claims.exp + skew <= nowSeconds) {
        throw new admin_auth_types_1.AdminAuthError('expired_token', 'id_token is expired or has no exp');
    }
    if (typeof claims.iat !== 'number' || claims.iat - skew > nowSeconds) {
        throw new admin_auth_types_1.AdminAuthError('future_token', 'id_token iat is in the future or missing');
    }
    if (options.expectedNonce !== undefined && claims.nonce !== options.expectedNonce) {
        throw new admin_auth_types_1.AdminAuthError('nonce_mismatch', 'id_token nonce does not match the state');
    }
    return claims;
}
