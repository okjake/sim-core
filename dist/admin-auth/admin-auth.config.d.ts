import type { AdminAuthConfig, AdminAuthFetch } from './admin-auth.types';
/** Google's OIDC endpoints. Overridable per config, only ever for tests. */
export declare const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export declare const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export declare const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
/** Both spellings are legitimate `iss` values for a Google id_token. */
export declare const GOOGLE_ISSUERS: readonly ["accounts.google.com", "https://accounts.google.com"];
export declare const DEFAULT_CALLBACK_PATH = "/admin/auth/callback";
/** Fixed, not configurable — the SPA links to it and it clears one named cookie. */
export declare const ADMIN_LOGOUT_PATH = "/admin/auth/logout";
export declare const DEFAULT_SESSION_COOKIE_NAME = "sim_admin_session";
/**
 * `Path=/` — not `/admin`. The session also authorizes `/__control/*`
 * (`ControlAuthGuard` accepts either `CONTROL_TOKEN` or this cookie), so the
 * browser has to send it there too. Nothing else on the origin reads cookies:
 * the domain API, `/docs` and the webhook receivers all use their own bearer,
 * API-key or signature schemes, so a cookie riding along on those requests is
 * inert.
 */
export declare const ADMIN_COOKIE_PATH = "/";
export declare const DEFAULT_SESSION_TTL_HOURS = 12;
export declare const DEFAULT_STATE_TTL_SECONDS = 600;
export declare const DEFAULT_JWKS_CACHE_TTL_SECONDS = 3600;
export declare const DEFAULT_CLOCK_SKEW_SECONDS = 120;
/** `sessionSecret` shorter than this is rejected at bootstrap. */
export declare const SESSION_SECRET_MIN_LENGTH = 32;
/** Fully defaulted config, the shape the service actually runs on. */
export interface ResolvedAdminAuthConfig {
    enabled: true;
    googleClientId: string;
    googleClientSecret: string;
    allowedDomain: string;
    /** Normalised to lowercase. `null` means "domain check only". */
    allowedEmails: string[] | null;
    sessionSecret: string;
    sessionTtlHours: number;
    callbackPath: string;
    cookieName: string;
    stateTtlSeconds: number;
    jwksCacheTtlSeconds: number;
    clockSkewSeconds: number;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    jwksUri: string;
    publicBaseUrl: string | null;
    secureCookie: boolean | null;
    fetchImpl: AdminAuthFetch | null;
}
/**
 * Validate and default an `adminAuth` block.
 *
 * Returns `null` when the gate is absent or explicitly disabled — that path
 * does no validation at all, which is what keeps a v0.2.0 config working
 * untouched. When it *is* enabled, every missing or nonsensical field throws:
 * the failure mode of a half-configured gate is an admin console open to the
 * internet, so it fails closed at bootstrap instead.
 */
export declare function resolveAdminAuthConfig(raw: AdminAuthConfig | undefined): ResolvedAdminAuthConfig | null;
