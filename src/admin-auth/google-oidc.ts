import {
  createPublicKey,
  verify as cryptoVerify,
  type JsonWebKeyInput,
  type KeyObject,
} from 'node:crypto';

import { GOOGLE_ISSUERS } from './admin-auth.config';
import {
  AdminAuthError,
  type AdminAuthFetch,
  type IdTokenClaims,
} from './admin-auth.types';

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
  header: { alg?: string; kid?: string; typ?: string };
  claims: IdTokenClaims;
  signingInput: string;
  signature: Buffer;
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

/** Split and decode without verifying anything. Never act on the result directly. */
export function decodeJwt(token: string): JwtParts {
  const parts = token.split('.');
  const [headerB64, claimsB64, signatureB64] = parts;
  if (parts.length !== 3 || !headerB64 || !claimsB64 || !signatureB64) {
    throw new AdminAuthError('malformed_id_token', 'id_token is not a three-part JWS');
  }

  let header: JwtParts['header'];
  let claims: IdTokenClaims;
  try {
    header = decodeSegment(headerB64) as JwtParts['header'];
    claims = decodeSegment(claimsB64) as IdTokenClaims;
  } catch {
    throw new AdminAuthError('malformed_id_token', 'id_token header or payload is not JSON');
  }
  if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object') {
    throw new AdminAuthError('malformed_id_token', 'id_token header or payload is not an object');
  }

  return {
    header,
    claims,
    signingInput: `${headerB64}.${claimsB64}`,
    signature: Buffer.from(signatureB64, 'base64url'),
  };
}

/** The subset of a JWK entry we need. Named to avoid the global DOM `JsonWebKey`. */
interface RawJwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

/**
 * Google's signing keys, cached by `kid`.
 *
 * Google rotates these every few days and publishes both the outgoing and
 * incoming key, so a TTL-based cache is correct as long as an unknown `kid`
 * triggers a refresh — which it does, rate-limited so a stream of tokens with
 * junk kids cannot turn this service into a load generator pointed at Google.
 */
export class GoogleJwksCache {
  private keys = new Map<string, KeyObject>();
  private expiresAt = 0;
  private lastFetchAt = 0;
  private inflight: Promise<void> | null = null;
  /** Refresh floor for the unknown-kid path. */
  private readonly minRefreshIntervalMs = 60_000;

  constructor(
    private readonly jwksUri: string,
    private readonly ttlSeconds: number,
    private readonly fetchImpl: AdminAuthFetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Test/introspection helper — how many keys are currently cached. */
  size(): number {
    return this.keys.size;
  }

  async getKey(kid: string): Promise<KeyObject> {
    if (this.keys.size === 0 || this.now() >= this.expiresAt) {
      await this.refresh();
    }

    const cached = this.keys.get(kid);
    if (cached) return cached;

    // Unknown kid: probably a rotation we have not seen. Refetch once, but not
    // more often than the floor.
    if (this.now() - this.lastFetchAt >= this.minRefreshIntervalMs) {
      await this.refresh();
      const refreshed = this.keys.get(kid);
      if (refreshed) return refreshed;
    }

    throw new AdminAuthError('unknown_key', `no JWKS key matches kid ${kid}`);
  }

  private async refresh(): Promise<void> {
    // Collapse concurrent misses into one request.
    this.inflight ??= this.doRefresh().finally(() => {
      this.inflight = null;
    });
    await this.inflight;
  }

  private async doRefresh(): Promise<void> {
    this.lastFetchAt = this.now();

    let body: string;
    try {
      const res = await this.fetchImpl(this.jwksUri, {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      body = await res.text();
    } catch (error) {
      throw new AdminAuthError(
        'jwks_unavailable',
        `could not fetch ${this.jwksUri}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let parsed: { keys?: RawJwk[] };
    try {
      parsed = JSON.parse(body) as { keys?: RawJwk[] };
    } catch {
      throw new AdminAuthError('jwks_unavailable', 'JWKS response was not JSON');
    }
    if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
      throw new AdminAuthError('jwks_unavailable', 'JWKS response contained no keys');
    }

    const next = new Map<string, KeyObject>();
    for (const jwk of parsed.keys) {
      if (!jwk?.kid || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) continue;
      if (jwk.alg && jwk.alg !== 'RS256') continue;
      try {
        next.set(
          jwk.kid,
          createPublicKey({ key: jwk, format: 'jwk' } as unknown as JsonWebKeyInput),
        );
      } catch {
        // A single unusable key must not poison the whole set.
        continue;
      }
    }

    if (next.size === 0) {
      throw new AdminAuthError('jwks_unavailable', 'JWKS response contained no usable RSA keys');
    }

    this.keys = next;
    this.expiresAt = this.now() + this.ttlSeconds * 1000;
  }
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
export async function verifyGoogleIdToken(
  idToken: string,
  options: VerifyIdTokenOptions,
): Promise<IdTokenClaims> {
  const nowMs = (options.now ?? Date.now)();
  const nowSeconds = Math.floor(nowMs / 1000);
  const skew = options.clockSkewSeconds;

  const { header, claims, signingInput, signature } = decodeJwt(idToken);

  // `alg: none` and a symmetric alg (where the "key" would be public JWKS
  // material) are the two classic JWT forgeries. Only RS256 is accepted.
  if (header.alg !== 'RS256') {
    throw new AdminAuthError('bad_algorithm', `unexpected id_token alg ${String(header.alg)}`);
  }
  if (!header.kid) {
    throw new AdminAuthError('malformed_id_token', 'id_token header has no kid');
  }

  const key = await options.jwks.getKey(header.kid);
  const signatureValid = cryptoVerify(
    'RSA-SHA256',
    Buffer.from(signingInput, 'utf8'),
    key,
    signature,
  );
  if (!signatureValid) {
    throw new AdminAuthError('bad_signature', 'id_token signature did not verify');
  }

  if (
    typeof claims.iss !== 'string' ||
    !(GOOGLE_ISSUERS as readonly string[]).includes(claims.iss)
  ) {
    throw new AdminAuthError('bad_issuer', `unexpected iss ${String(claims.iss)}`);
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(options.clientId)) {
    throw new AdminAuthError('bad_audience', 'id_token aud is not this client');
  }

  if (typeof claims.exp !== 'number' || claims.exp + skew <= nowSeconds) {
    throw new AdminAuthError('expired_token', 'id_token is expired or has no exp');
  }
  if (typeof claims.iat !== 'number' || claims.iat - skew > nowSeconds) {
    throw new AdminAuthError('future_token', 'id_token iat is in the future or missing');
  }

  if (options.expectedNonce !== undefined && claims.nonce !== options.expectedNonce) {
    throw new AdminAuthError('nonce_mismatch', 'id_token nonce does not match the state');
  }

  return claims;
}
