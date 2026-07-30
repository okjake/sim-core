"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_SECRET_MIN_LENGTH = exports.DEFAULT_CLOCK_SKEW_SECONDS = exports.DEFAULT_JWKS_CACHE_TTL_SECONDS = exports.DEFAULT_STATE_TTL_SECONDS = exports.DEFAULT_SESSION_TTL_HOURS = exports.ADMIN_COOKIE_PATH = exports.DEFAULT_SESSION_COOKIE_NAME = exports.ADMIN_LOGOUT_PATH = exports.DEFAULT_CALLBACK_PATH = exports.GOOGLE_ISSUERS = exports.GOOGLE_JWKS_URI = exports.GOOGLE_TOKEN_ENDPOINT = exports.GOOGLE_AUTHORIZATION_ENDPOINT = void 0;
exports.resolveAdminAuthConfig = resolveAdminAuthConfig;
/** Google's OIDC endpoints. Overridable per config, only ever for tests. */
exports.GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
exports.GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
exports.GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
/** Both spellings are legitimate `iss` values for a Google id_token. */
exports.GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
exports.DEFAULT_CALLBACK_PATH = '/admin/auth/callback';
/** Fixed, not configurable — the SPA links to it and it clears one named cookie. */
exports.ADMIN_LOGOUT_PATH = '/admin/auth/logout';
exports.DEFAULT_SESSION_COOKIE_NAME = 'sim_admin_session';
/** The cookie is scoped to the gated surface and nothing else. */
exports.ADMIN_COOKIE_PATH = '/admin';
exports.DEFAULT_SESSION_TTL_HOURS = 12;
exports.DEFAULT_STATE_TTL_SECONDS = 600;
exports.DEFAULT_JWKS_CACHE_TTL_SECONDS = 3600;
exports.DEFAULT_CLOCK_SKEW_SECONDS = 120;
/** `sessionSecret` shorter than this is rejected at bootstrap. */
exports.SESSION_SECRET_MIN_LENGTH = 32;
function fail(message) {
    throw new Error(`SimCoreConfig.adminAuth.${message}`);
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
function resolveAdminAuthConfig(raw) {
    if (!raw || raw.enabled !== true) {
        return null;
    }
    if (!raw.googleClientId)
        fail('googleClientId is required when enabled (set GOOGLE_CLIENT_ID)');
    if (!raw.googleClientSecret) {
        fail('googleClientSecret is required when enabled (set GOOGLE_CLIENT_SECRET)');
    }
    if (!raw.allowedDomain) {
        fail('allowedDomain is required when enabled (set ADMIN_ALLOWED_DOMAIN)');
    }
    if (raw.allowedDomain.includes('@')) {
        fail("allowedDomain is a bare domain, not an address — drop the '@'");
    }
    if (!raw.sessionSecret || raw.sessionSecret.length < exports.SESSION_SECRET_MIN_LENGTH) {
        fail(`sessionSecret is required when enabled and must be at least ${exports.SESSION_SECRET_MIN_LENGTH} characters (set ADMIN_SESSION_SECRET)`);
    }
    const ttlHours = raw.sessionTtlHours ?? exports.DEFAULT_SESSION_TTL_HOURS;
    if (!(ttlHours > 0) || !Number.isFinite(ttlHours)) {
        fail('sessionTtlHours must be a positive number of hours');
    }
    const callbackPath = raw.callbackPath ?? exports.DEFAULT_CALLBACK_PATH;
    if (!callbackPath.startsWith('/admin/')) {
        fail("callbackPath must live under '/admin/' — that is the only gated prefix");
    }
    let allowedEmails = null;
    if (raw.allowedEmails !== undefined) {
        if (!Array.isArray(raw.allowedEmails) || raw.allowedEmails.length === 0) {
            fail('allowedEmails, when present, must be a non-empty array of addresses');
        }
        if (raw.allowedEmails.some((email) => typeof email !== 'string' || !email.includes('@'))) {
            fail('allowedEmails must contain full email addresses');
        }
        allowedEmails = raw.allowedEmails.map((email) => email.trim().toLowerCase());
    }
    return {
        enabled: true,
        googleClientId: raw.googleClientId,
        googleClientSecret: raw.googleClientSecret,
        allowedDomain: raw.allowedDomain.trim().toLowerCase(),
        allowedEmails,
        sessionSecret: raw.sessionSecret,
        sessionTtlHours: ttlHours,
        callbackPath,
        cookieName: raw.cookieName ?? exports.DEFAULT_SESSION_COOKIE_NAME,
        stateTtlSeconds: raw.stateTtlSeconds ?? exports.DEFAULT_STATE_TTL_SECONDS,
        jwksCacheTtlSeconds: raw.jwksCacheTtlSeconds ?? exports.DEFAULT_JWKS_CACHE_TTL_SECONDS,
        clockSkewSeconds: raw.clockSkewSeconds ?? exports.DEFAULT_CLOCK_SKEW_SECONDS,
        authorizationEndpoint: raw.authorizationEndpoint ?? exports.GOOGLE_AUTHORIZATION_ENDPOINT,
        tokenEndpoint: raw.tokenEndpoint ?? exports.GOOGLE_TOKEN_ENDPOINT,
        jwksUri: raw.jwksUri ?? exports.GOOGLE_JWKS_URI,
        publicBaseUrl: raw.publicBaseUrl ?? null,
        secureCookie: raw.secureCookie ?? null,
        fetchImpl: raw.fetchImpl ?? null,
    };
}
