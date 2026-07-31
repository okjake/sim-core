"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuthService = void 0;
exports.isAdminGatedPath = isAdminGatedPath;
exports.parseCookieHeader = parseCookieHeader;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const config_1 = require("../config");
const admin_auth_config_1 = require("./admin-auth.config");
const admin_auth_types_1 = require("./admin-auth.types");
const google_oidc_1 = require("./google-oidc");
/** Paths under `/admin` that the gate itself owns and must never redirect. */
function isAdminGatedPath(path) {
    return path === '/admin' || path.startsWith('/admin/');
}
/** Hand-rolled `Cookie:` parser — one header, no dependency, no surprises. */
function parseCookieHeader(header) {
    const out = {};
    if (!header)
        return out;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 1)
            continue;
        const name = part.slice(0, eq).trim();
        if (!name || out[name] !== undefined)
            continue;
        const value = part.slice(eq + 1).trim();
        try {
            out[name] = decodeURIComponent(value);
        }
        catch {
            out[name] = value;
        }
    }
    return out;
}
/**
 * Derive a purpose-scoped key from `sessionSecret`.
 *
 * The session cookie and the OAuth `state` are both HMAC-SHA256 over
 * attacker-visible JSON. Signing them with the *same* key would let a value
 * minted for one purpose be presented as the other; a one-line domain
 * separation removes the question entirely.
 */
function deriveKey(secret, purpose) {
    return (0, node_crypto_1.createHmac)('sha256', secret).update(`sim-core.admin-auth.${purpose}`).digest();
}
function sign(key, payload) {
    return (0, node_crypto_1.createHmac)('sha256', key).update(payload).digest('base64url');
}
function signedPayload(key, value) {
    const payload = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
    return `${payload}.${sign(key, payload)}`;
}
function openSignedPayload(key, token) {
    if (!token)
        return null;
    const dot = token.lastIndexOf('.');
    if (dot < 1)
        return null;
    const payload = token.slice(0, dot);
    const provided = Buffer.from(token.slice(dot + 1), 'utf8');
    const expected = Buffer.from(sign(key, payload), 'utf8');
    if (provided.length !== expected.length || !(0, node_crypto_1.timingSafeEqual)(provided, expected)) {
        return null;
    }
    try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
/** Bound so a flood of sign-in starts cannot grow the process. */
const MAX_PENDING_LOGINS = 500;
/**
 * The Google-OIDC gate for `/admin`.
 *
 * Always constructed, even when the gate is off: `isEnabled()` is then false
 * and every other method is inert, so `SimCoreModule` does not have to branch
 * its provider list and a disabled service pays nothing but one boolean check
 * per `/admin` request.
 */
let AdminAuthService = class AdminAuthService {
    config;
    logger = new common_1.Logger('SimCore:adminAuth');
    resolved;
    sessionKey;
    stateKey;
    jwks;
    pending = new Map();
    constructor(config) {
        this.config = config;
        this.resolved = (0, admin_auth_config_1.resolveAdminAuthConfig)(config?.adminAuth);
        if (!this.resolved) {
            this.sessionKey = null;
            this.stateKey = null;
            this.jwks = null;
            return;
        }
        this.sessionKey = deriveKey(this.resolved.sessionSecret, 'session');
        this.stateKey = deriveKey(this.resolved.sessionSecret, 'state');
        this.jwks = new google_oidc_1.GoogleJwksCache(this.resolved.jwksUri, this.resolved.jwksCacheTtlSeconds, (url, init) => this.fetch(url, init));
    }
    isEnabled() {
        return this.resolved !== null;
    }
    /** Throws when the gate is off — callers check {@link isEnabled} first. */
    get settings() {
        if (!this.resolved) {
            throw new Error('adminAuth is not enabled');
        }
        return this.resolved;
    }
    get logoutPath() {
        return admin_auth_config_1.ADMIN_LOGOUT_PATH;
    }
    fetch(url, init) {
        const impl = this.resolved?.fetchImpl ?? globalThis.fetch;
        if (!impl) {
            return Promise.reject(new Error('No fetch implementation available for adminAuth'));
        }
        return impl(url, init);
    }
    // --- session cookie -------------------------------------------------------
    /**
     * The signed session cookie. Payload is exactly `{ email, exp }` — no roles,
     * no tokens, no id_token passthrough. Anything more would be state a rejected
     * admin could still be carrying around after their access was revoked.
     */
    issueSession(email, now = Date.now()) {
        const ttlSeconds = Math.floor(this.settings.sessionTtlHours * 3600);
        return { email, exp: Math.floor(now / 1000) + ttlSeconds };
    }
    serializeSession(session) {
        if (!this.sessionKey)
            throw new Error('adminAuth is not enabled');
        return signedPayload(this.sessionKey, session);
    }
    /**
     * Read and fully re-validate the session on a request.
     *
     * The authorisation rules are re-applied on every request rather than trusted
     * from issue time, so tightening `allowedDomain` or `allowedEmails` and
     * redeploying logs the removed people out immediately instead of at the end
     * of their 12-hour cookie.
     */
    authenticate(req, now = Date.now()) {
        if (!this.resolved || !this.sessionKey)
            return null;
        const cookies = parseCookieHeader(req.headers.cookie);
        const session = openSignedPayload(this.sessionKey, cookies[this.resolved.cookieName]);
        if (!session || typeof session.email !== 'string' || typeof session.exp !== 'number') {
            return null;
        }
        if (session.exp <= Math.floor(now / 1000)) {
            return null;
        }
        if (!this.emailAllowed(session.email)) {
            return null;
        }
        return session;
    }
    setCookieHeader(req, session) {
        const maxAge = Math.max(0, session.exp - Math.floor(Date.now() / 1000));
        return this.cookie(req, this.serializeSession(session), maxAge);
    }
    /**
     * One `Set-Cookie` per path this session has ever been issued at.
     *
     * Not just the current one: a cookie is identified by name + domain + path,
     * so clearing `Path=/` leaves a `Path=/admin` cookie from before v0.4.0
     * completely untouched. That stale cookie is worse than no cookie — it
     * satisfies `/admin` while never being sent to `/__control`, which the admin
     * SPA reads as an expired session and answers by reloading, forever. Signing
     * out is the one action a stuck operator can still take, so it has to
     * actually get them unstuck.
     */
    clearCookieHeader(req) {
        return [admin_auth_config_1.ADMIN_COOKIE_PATH, ...admin_auth_config_1.LEGACY_ADMIN_COOKIE_PATHS].map((path) => this.cookie(req, '', 0, path));
    }
    cookie(req, value, maxAgeSeconds, path = admin_auth_config_1.ADMIN_COOKIE_PATH) {
        const attrs = [
            `${this.settings.cookieName}=${value}`,
            `Path=${path}`,
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${maxAgeSeconds}`,
        ];
        if (this.isSecureRequest(req)) {
            attrs.push('Secure');
        }
        return attrs.join('; ');
    }
    /**
     * Render terminates TLS, so `req.protocol` is only meaningful with
     * `trust proxy` set (which `bootstrapSimService` does). The forwarded header
     * is checked directly as well, for consumers that bootstrap Nest themselves —
     * getting this wrong means either a cookie marked `Secure` on plain HTTP
     * (silently dropped, infinite redirect loop) or a session cookie that travels
     * in the clear.
     */
    isSecureRequest(req) {
        if (this.settings.secureCookie !== null) {
            return this.settings.secureCookie;
        }
        return this.requestIsHttps(req);
    }
    requestIsHttps(req) {
        if (req.secure)
            return true;
        const forwarded = req.headers['x-forwarded-proto'];
        const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
        return typeof first === 'string' && first.split(',')[0]?.trim() === 'https';
    }
    // --- authorization-code flow ---------------------------------------------
    /** Absolute `redirect_uri`, which must byte-match the Google client config. */
    redirectUri(req) {
        const base = this.settings.publicBaseUrl ?? this.origin(req);
        return `${base.replace(/\/+$/, '')}${this.settings.callbackPath}`;
    }
    origin(req) {
        const proto = this.requestIsHttps(req) ? 'https' : 'http';
        const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
        const first = Array.isArray(host) ? host[0] : host;
        return `${proto}://${String(first).split(',')[0]?.trim() ?? 'localhost'}`;
    }
    /**
     * Start a sign-in: mint the state + nonce and return the Google URL.
     *
     * `state` is an HMAC-signed `{nonce, issuedAt, returnTo}`; the nonce is *also*
     * recorded server-side and deleted on use. Signature alone stops tampering,
     * the timestamp stops replay-after-expiry, and the server-side record stops
     * replay inside the window — a signed-but-stateless state can be reused for
     * its whole validity period.
     */
    buildAuthorizationUrl(req, now = Date.now()) {
        if (!this.stateKey)
            throw new Error('adminAuth is not enabled');
        const settings = this.settings;
        this.prunePending(now);
        if (this.pending.size >= MAX_PENDING_LOGINS) {
            const oldest = this.pending.keys().next();
            if (!oldest.done)
                this.pending.delete(oldest.value);
        }
        const nonce = (0, node_crypto_1.randomBytes)(18).toString('base64url');
        const oidcNonce = (0, node_crypto_1.randomBytes)(18).toString('base64url');
        const returnTo = this.safeReturnTo(req);
        this.pending.set(nonce, { issuedAt: now, returnTo, oidcNonce });
        const state = signedPayload(this.stateKey, {
            n: nonce,
            t: Math.floor(now / 1000),
            r: returnTo,
        });
        const params = new URLSearchParams({
            client_id: settings.googleClientId,
            redirect_uri: this.redirectUri(req),
            response_type: 'code',
            scope: 'openid email profile',
            state,
            nonce: oidcNonce,
            // A hint, not a control: Google may still return a different `hd`, which
            // is why `authorizeClaims` checks the claim rather than trusting this.
            hd: settings.allowedDomain,
            prompt: 'select_account',
        });
        return `${settings.authorizationEndpoint}?${params.toString()}`;
    }
    /** Only internal `/admin…` paths survive, so `state` cannot carry an open redirect. */
    safeReturnTo(req) {
        const url = req.originalUrl || req.url || '/admin';
        if (!url.startsWith('/admin') || url.startsWith('//') || url.includes('\\')) {
            return '/admin';
        }
        const path = url.split('?')[0] ?? '/admin';
        if (path === this.settings.callbackPath || path === admin_auth_config_1.ADMIN_LOGOUT_PATH) {
            return '/admin';
        }
        return url;
    }
    prunePending(now) {
        const cutoff = now - this.settings.stateTtlSeconds * 1000;
        for (const [nonce, record] of this.pending) {
            if (record.issuedAt < cutoff)
                this.pending.delete(nonce);
        }
    }
    /** Exposed for tests — how many sign-ins are mid-flight. */
    pendingCount() {
        return this.pending.size;
    }
    /**
     * Handle `GET <callbackPath>`: validate state, exchange the code, verify the
     * id_token, authorise the claims. Never throws — every failure comes back as
     * a reason code for the caller to log and swallow behind one 403.
     */
    async handleCallback(req, now = Date.now()) {
        const jwks = this.jwks;
        if (!this.resolved || !this.stateKey || !jwks) {
            return { ok: false, reason: 'bad_state' };
        }
        try {
            const code = this.queryParam(req, 'code');
            if (!code) {
                throw new admin_auth_types_1.AdminAuthError('no_code', 'callback had no authorization code');
            }
            const state = openSignedPayload(this.stateKey, this.queryParam(req, 'state') ?? undefined);
            if (!state || typeof state.n !== 'string' || typeof state.t !== 'number') {
                throw new admin_auth_types_1.AdminAuthError('bad_state', 'state missing, malformed or wrongly signed');
            }
            if (state.t * 1000 < now - this.resolved.stateTtlSeconds * 1000) {
                this.pending.delete(state.n);
                throw new admin_auth_types_1.AdminAuthError('expired_state', 'state is older than its validity window');
            }
            const record = this.pending.get(state.n);
            if (!record) {
                throw new admin_auth_types_1.AdminAuthError('replayed_state', 'state nonce is unknown or already used');
            }
            this.pending.delete(state.n);
            const idToken = await this.exchangeCode(code, this.redirectUri(req));
            const claims = await (0, google_oidc_1.verifyGoogleIdToken)(idToken, {
                clientId: this.resolved.googleClientId,
                expectedNonce: record.oidcNonce,
                clockSkewSeconds: this.resolved.clockSkewSeconds,
                jwks,
                now: () => now,
            });
            const email = this.authorizeClaims(claims);
            return { ok: true, session: this.issueSession(email, now), returnTo: record.returnTo };
        }
        catch (error) {
            const reason = error instanceof admin_auth_types_1.AdminAuthError ? error.reason : 'token_exchange_failed';
            this.logger.warn(`admin sign-in rejected (${reason}): ${error instanceof Error ? error.message : String(error)}`);
            return { ok: false, reason };
        }
    }
    queryParam(req, name) {
        const value = req.query?.[name];
        if (typeof value === 'string')
            return value;
        if (Array.isArray(value) && typeof value[0] === 'string')
            return value[0];
        return null;
    }
    /** Server-side code exchange — this is the only place the client secret is used. */
    async exchangeCode(code, redirectUri) {
        const body = new URLSearchParams({
            code,
            client_id: this.settings.googleClientId,
            client_secret: this.settings.googleClientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }).toString();
        let text;
        let ok;
        let status;
        try {
            const res = await this.fetch(this.settings.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    accept: 'application/json',
                },
                body,
            });
            ok = res.ok;
            status = res.status;
            text = await res.text();
        }
        catch (error) {
            throw new admin_auth_types_1.AdminAuthError('token_exchange_failed', `token endpoint unreachable: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!ok) {
            throw new admin_auth_types_1.AdminAuthError('token_exchange_failed', `token endpoint returned ${status}`);
        }
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            throw new admin_auth_types_1.AdminAuthError('token_exchange_failed', 'token endpoint response was not JSON');
        }
        if (typeof parsed.id_token !== 'string' || parsed.id_token.length === 0) {
            throw new admin_auth_types_1.AdminAuthError('no_id_token', 'token endpoint response carried no id_token');
        }
        return parsed.id_token;
    }
    /**
     * The authorisation decision, on already-signature-verified claims.
     *
     * `hd` AND the email suffix are both required. They normally agree, but they
     * are different assertions — `hd` is "this account belongs to that Workspace",
     * the suffix is "this address is in that domain" — and requiring both means a
     * single surprising claim shape cannot let an outsider in.
     */
    authorizeClaims(claims) {
        const settings = this.settings;
        const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
        if (!email) {
            throw new admin_auth_types_1.AdminAuthError('no_email', 'id_token carried no email claim');
        }
        if (claims.email_verified !== true && claims.email_verified !== 'true') {
            throw new admin_auth_types_1.AdminAuthError('email_not_verified', `${email} is not a verified address`);
        }
        const hd = typeof claims.hd === 'string' ? claims.hd.trim().toLowerCase() : '';
        if (hd !== settings.allowedDomain) {
            throw new admin_auth_types_1.AdminAuthError('wrong_hd', `hd claim ${hd || '(absent)'} is not allowed`);
        }
        if (!email.endsWith(`@${settings.allowedDomain}`)) {
            throw new admin_auth_types_1.AdminAuthError('wrong_email_domain', `${email} is outside the allowed domain`);
        }
        if (settings.allowedEmails && !settings.allowedEmails.includes(email)) {
            throw new admin_auth_types_1.AdminAuthError('not_in_allowlist', `${email} is not on allowedEmails`);
        }
        return email;
    }
    /** Domain + allowlist re-check, used when re-reading an existing cookie. */
    emailAllowed(rawEmail) {
        const settings = this.settings;
        const email = rawEmail.trim().toLowerCase();
        if (!email.endsWith(`@${settings.allowedDomain}`))
            return false;
        if (settings.allowedEmails && !settings.allowedEmails.includes(email))
            return false;
        return true;
    }
};
exports.AdminAuthService = AdminAuthService;
exports.AdminAuthService = AdminAuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, common_1.Inject)(config_1.SIM_CORE_CONFIG)),
    __metadata("design:paramtypes", [Object])
], AdminAuthService);
