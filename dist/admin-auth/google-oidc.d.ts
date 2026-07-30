import { type KeyObject } from 'node:crypto';
import { type AdminAuthFetch, type IdTokenClaims } from './admin-auth.types';
/**
 * Hand-rolled RS256 id_token verification against Google's JWKS.
 *
 * No `jose`, no `openid-client`, no `google-auth-library` — the house ethos, and
 * in this case a small one: Node ships JWK import (`createPublicKey({ format:
 * 'jwk' })`) and raw RSA-SHA256 verification, so the whole thing is the two
 * functions below plus a cache.
 *
 * The one rule that matters: **the signature is checked before any claim is
 * trusted.** An unverified JWT is attacker-controlled JSON; reading `email` or
 * `hd` out of one and acting on it is the classic way to build an auth bypass.
 */
interface JwtParts {
    header: {
        alg?: string;
        kid?: string;
        typ?: string;
    };
    claims: IdTokenClaims;
    signingInput: string;
    signature: Buffer;
}
/** Split and decode without verifying anything. Never act on the result directly. */
export declare function decodeJwt(token: string): JwtParts;
/**
 * Google's signing keys, cached by `kid`.
 *
 * Google rotates these every few days and publishes both the outgoing and
 * incoming key, so a TTL-based cache is correct as long as an unknown `kid`
 * triggers a refresh — which it does, rate-limited so a stream of tokens with
 * junk kids cannot turn this service into a load generator pointed at Google.
 */
export declare class GoogleJwksCache {
    private readonly jwksUri;
    private readonly ttlSeconds;
    private readonly fetchImpl;
    private readonly now;
    private keys;
    private expiresAt;
    private lastFetchAt;
    private inflight;
    /** Refresh floor for the unknown-kid path. */
    private readonly minRefreshIntervalMs;
    constructor(jwksUri: string, ttlSeconds: number, fetchImpl: AdminAuthFetch, now?: () => number);
    /** Test/introspection helper — how many keys are currently cached. */
    size(): number;
    getKey(kid: string): Promise<KeyObject>;
    private refresh;
    private doRefresh;
}
export interface VerifyIdTokenOptions {
    clientId: string;
    /** The nonce this login round-trip was started with. */
    expectedNonce?: string;
    clockSkewSeconds: number;
    jwks: GoogleJwksCache;
    now?: () => number;
}
/**
 * Verify signature first, then issuer, audience, lifetime and nonce.
 *
 * Returns the claims only if every check passed; throws an
 * {@link AdminAuthError} carrying a machine-readable reason otherwise. The
 * caller logs the reason and shows a generic 403.
 */
export declare function verifyGoogleIdToken(idToken: string, options: VerifyIdTokenOptions): Promise<IdTokenClaims>;
export {};
