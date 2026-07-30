import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto';

import {
  GOOGLE_JWKS_URI,
  GOOGLE_TOKEN_ENDPOINT,
  type AdminAuthFetch,
  type IdTokenClaims,
} from '../src';

/**
 * A fake Google, wired in through `adminAuth.fetchImpl`.
 *
 * Nothing in this suite touches the network: the JWKS is served from a locally
 * generated RSA keypair and the token endpoint hands back an id_token we signed
 * ourselves. That is also what makes the signature test meaningful — the
 * "wrong key" case signs with a *second* real keypair that is not in the
 * published JWKS, so a verifier that skipped the signature check would pass it.
 */

export interface TestKeyPair {
  kid: string;
  publicKey: KeyObject;
  privateKey: KeyObject;
}

export function generateTestKey(kid: string): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, publicKey, privateKey };
}

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export interface SignIdTokenOptions {
  key: TestKeyPair;
  claims: IdTokenClaims;
  /** Override the JOSE header — used to forge `alg: none` / `HS256`. */
  header?: Record<string, unknown>;
}

export function signIdToken({ key, claims, header }: SignIdTokenOptions): string {
  const head = b64url({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...header });
  const body = b64url(claims);
  const signingInput = `${head}.${body}`;
  const signature = cryptoSign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), key.privateKey);
  return `${signingInput}.${signature.toString('base64url')}`;
}

export function jwksFor(...keys: TestKeyPair[]): string {
  return JSON.stringify({
    keys: keys.map((key) => ({
      ...(key.publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
      kid: key.kid,
      alg: 'RS256',
      use: 'sig',
    })),
  });
}

export interface GoogleStub {
  fetchImpl: AdminAuthFetch;
  /** The id_token the next token exchange will return. */
  idToken: string | null;
  /** Force a non-2xx from the token endpoint. */
  tokenStatus: number;
  /** Force a non-2xx from the JWKS endpoint. */
  jwksStatus: number;
  /** Raw JWKS body. Replace to simulate a rotation. */
  jwksBody: string;
  calls: Array<{ url: string; method: string; body?: string }>;
  tokenRequests(): Array<Record<string, string>>;
  jwksFetches(): number;
}

/** Build a stub serving `keys` as the JWKS and `idToken` from the token endpoint. */
export function createGoogleStub(options: {
  keys: TestKeyPair[];
  idToken?: string;
  jwksUri?: string;
  tokenEndpoint?: string;
}): GoogleStub {
  const jwksUri = options.jwksUri ?? GOOGLE_JWKS_URI;
  const tokenEndpoint = options.tokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT;

  const stub: GoogleStub = {
    idToken: options.idToken ?? null,
    tokenStatus: 200,
    jwksStatus: 200,
    jwksBody: jwksFor(...options.keys),
    calls: [],
    fetchImpl: (url, init) => {
      stub.calls.push({ url, method: init.method, body: init.body });

      if (url.startsWith(jwksUri)) {
        return Promise.resolve({
          status: stub.jwksStatus,
          ok: stub.jwksStatus < 400,
          text: () => Promise.resolve(stub.jwksBody),
        });
      }

      if (url.startsWith(tokenEndpoint)) {
        return Promise.resolve({
          status: stub.tokenStatus,
          ok: stub.tokenStatus < 400,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                access_token: 'stub-access-token',
                token_type: 'Bearer',
                expires_in: 3599,
                ...(stub.idToken ? { id_token: stub.idToken } : {}),
              }),
            ),
        });
      }

      return Promise.reject(new Error(`unexpected fetch to ${url}`));
    },
    tokenRequests: () =>
      stub.calls
        .filter((call) => call.url.startsWith(tokenEndpoint))
        .map((call) => Object.fromEntries(new URLSearchParams(call.body ?? ''))),
    jwksFetches: () => stub.calls.filter((call) => call.url.startsWith(jwksUri)).length,
  };

  return stub;
}

/** A claim set that passes every check, before any test-specific mutation. */
export function validClaims(overrides: IdTokenClaims = {}): IdTokenClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://accounts.google.com',
    aud: 'demo-client-id.apps.googleusercontent.com',
    sub: '1234567890',
    email: 'jake@partnerapi.com',
    email_verified: true,
    hd: 'partnerapi.com',
    name: 'Jake',
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}
