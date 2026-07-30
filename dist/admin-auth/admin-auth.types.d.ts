/**
 * Types for the optional Google-OIDC gate in front of the admin SPA.
 *
 * Scope discipline (the whole reason this module exists in sim-core rather than
 * in front of it): **only the human surface is gated.** The domain API, `/docs`,
 * `/openapi.json`, `/health`, webhook receivers and every `/__control/*` route
 * keep exactly the auth they had — the platform polls the first three and
 * automation drives the last with `CONTROL_TOKEN`. A gate that caught those
 * would be indistinguishable, from the platform's side, from an upstream that
 * started 302ing its spec endpoint.
 */
/**
 * Minimal fetch shape used for the token exchange and the JWKS fetch.
 *
 * Deliberately a *subset* of {@link import('../driver/driver.types').FetchLike}
 * so a consumer (or a test) can pass one implementation to both, and so the
 * global `fetch` satisfies it without a cast at the call site.
 */
export type AdminAuthFetch = (url: string, init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}) => Promise<{
    status: number;
    ok: boolean;
    text(): Promise<string>;
}>;
/**
 * Optional Google-OIDC sign-in gate for `/admin`.
 *
 * Omit the whole object (or set `enabled: false`) and the service behaves
 * exactly as it did on v0.2.0 — no redirect, no cookie, no extra routes. Set
 * `enabled: true` and the rest of the required fields become mandatory at
 * bootstrap: an enabled-but-incomplete config throws rather than silently
 * serving an ungated admin console.
 */
export interface AdminAuthConfig {
    /** Master switch. Default (and the value for local dev) is `false`. */
    enabled: boolean;
    /** OAuth 2.0 client id from the Google Cloud console. `GOOGLE_CLIENT_ID`. */
    googleClientId: string;
    /** OAuth 2.0 client secret. Server-side only. `GOOGLE_CLIENT_SECRET`. */
    googleClientSecret: string;
    /**
     * Google Workspace domain allowed to sign in, e.g. `partnerapi.com`.
     * Checked twice: the `hd` claim AND the `email` suffix (see
     * `authorizeClaims` — `hd` alone has been spoofable in the past).
     */
    allowedDomain: string;
    /** Optional extra restriction: only these addresses, on top of the domain. */
    allowedEmails?: string[];
    /** HMAC key for the session cookie and the OAuth `state`. >= 32 characters. */
    sessionSecret: string;
    /** Session lifetime. Default 12. */
    sessionTtlHours?: number;
    /** OAuth redirect path. Default `/admin/auth/callback`. Must sit under `/admin`. */
    callbackPath?: string;
    /**
     * Injected fetch for the token exchange and the JWKS fetch, exactly like
     * `DriverConfig.fetchImpl`. Defaults to the global `fetch`. The suite passes
     * a stub here so no test — and no offline `pnpm example` — ever reaches
     * accounts.google.com.
     */
    fetchImpl?: AdminAuthFetch;
    /** Override the origin used to build `redirect_uri`. Default: derived from the request. */
    publicBaseUrl?: string;
    /** Force the cookie's `Secure` attribute instead of deriving it from the request. */
    secureCookie?: boolean;
    /** Session cookie name. Default `sim_admin_session`. */
    cookieName?: string;
    /** Validity window of the signed `state` value, in seconds. Default 600 (10 minutes). */
    stateTtlSeconds?: number;
    /** JWKS cache lifetime, in seconds. Default 3600. */
    jwksCacheTtlSeconds?: number;
    /** Tolerance for `exp` / `iat` clock skew, in seconds. Default 120. */
    clockSkewSeconds?: number;
    /** Override for testing / self-hosted proxies. */
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    jwksUri?: string;
}
/** What the signed session cookie carries. Nothing else belongs in here. */
export interface AdminSession {
    email: string;
    /** Epoch seconds. */
    exp: number;
}
/** Claims we read off a Google id_token. Everything is optional until verified. */
export interface IdTokenClaims {
    iss?: string;
    aud?: string | string[];
    sub?: string;
    email?: string;
    /** Google sends a boolean; some libraries stringify it. Both are accepted. */
    email_verified?: boolean | string;
    /** Workspace domain. Absent for consumer @gmail.com accounts. */
    hd?: string;
    name?: string;
    exp?: number;
    iat?: number;
    nonce?: string;
    [claim: string]: unknown;
}
/**
 * Why a sign-in attempt failed. Logged server-side; **never rendered** — the
 * 403 page is identical for every reason so a probe cannot learn whether it got
 * the domain right, the allowlist wrong, or the signature bad.
 */
export type AdminAuthFailure = 'no_code' | 'bad_state' | 'expired_state' | 'replayed_state' | 'token_exchange_failed' | 'no_id_token' | 'malformed_id_token' | 'bad_algorithm' | 'unknown_key' | 'bad_signature' | 'bad_issuer' | 'bad_audience' | 'expired_token' | 'future_token' | 'nonce_mismatch' | 'no_email' | 'email_not_verified' | 'wrong_hd' | 'wrong_email_domain' | 'not_in_allowlist' | 'jwks_unavailable';
/** Internal error carrying an {@link AdminAuthFailure}. Not exported to the wire. */
export declare class AdminAuthError extends Error {
    readonly reason: AdminAuthFailure;
    constructor(reason: AdminAuthFailure, message?: string);
}
