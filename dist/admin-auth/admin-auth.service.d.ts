import type { Request } from 'express';
import { type SimCoreConfig } from '../config';
import { type ResolvedAdminAuthConfig } from './admin-auth.config';
import { type AdminAuthFailure, type AdminSession, type IdTokenClaims } from './admin-auth.types';
/** Paths under `/admin` that the gate itself owns and must never redirect. */
export declare function isAdminGatedPath(path: string): boolean;
/** Hand-rolled `Cookie:` parser — one header, no dependency, no surprises. */
export declare function parseCookieHeader(header: string | undefined): Record<string, string>;
export interface CallbackSuccess {
    ok: true;
    session: AdminSession;
    returnTo: string;
}
export interface CallbackFailure {
    ok: false;
    reason: AdminAuthFailure;
}
/**
 * The Google-OIDC gate for `/admin`.
 *
 * Always constructed, even when the gate is off: `isEnabled()` is then false
 * and every other method is inert, so `SimCoreModule` does not have to branch
 * its provider list and a disabled service pays nothing but one boolean check
 * per `/admin` request.
 */
export declare class AdminAuthService {
    private readonly config?;
    private readonly logger;
    private readonly resolved;
    private readonly sessionKey;
    private readonly stateKey;
    private readonly jwks;
    private readonly pending;
    constructor(config?: SimCoreConfig | undefined);
    isEnabled(): boolean;
    /** Throws when the gate is off — callers check {@link isEnabled} first. */
    get settings(): ResolvedAdminAuthConfig;
    get logoutPath(): string;
    private fetch;
    /**
     * The signed session cookie. Payload is exactly `{ email, exp }` — no roles,
     * no tokens, no id_token passthrough. Anything more would be state a rejected
     * admin could still be carrying around after their access was revoked.
     */
    issueSession(email: string, now?: number): AdminSession;
    serializeSession(session: AdminSession): string;
    /**
     * Read and fully re-validate the session on a request.
     *
     * The authorisation rules are re-applied on every request rather than trusted
     * from issue time, so tightening `allowedDomain` or `allowedEmails` and
     * redeploying logs the removed people out immediately instead of at the end
     * of their 12-hour cookie.
     */
    authenticate(req: Request, now?: number): AdminSession | null;
    setCookieHeader(req: Request, session: AdminSession): string;
    clearCookieHeader(req: Request): string;
    private cookie;
    /**
     * Render terminates TLS, so `req.protocol` is only meaningful with
     * `trust proxy` set (which `bootstrapSimService` does). The forwarded header
     * is checked directly as well, for consumers that bootstrap Nest themselves —
     * getting this wrong means either a cookie marked `Secure` on plain HTTP
     * (silently dropped, infinite redirect loop) or a session cookie that travels
     * in the clear.
     */
    isSecureRequest(req: Request): boolean;
    private requestIsHttps;
    /** Absolute `redirect_uri`, which must byte-match the Google client config. */
    redirectUri(req: Request): string;
    private origin;
    /**
     * Start a sign-in: mint the state + nonce and return the Google URL.
     *
     * `state` is an HMAC-signed `{nonce, issuedAt, returnTo}`; the nonce is *also*
     * recorded server-side and deleted on use. Signature alone stops tampering,
     * the timestamp stops replay-after-expiry, and the server-side record stops
     * replay inside the window — a signed-but-stateless state can be reused for
     * its whole validity period.
     */
    buildAuthorizationUrl(req: Request, now?: number): string;
    /** Only internal `/admin…` paths survive, so `state` cannot carry an open redirect. */
    private safeReturnTo;
    private prunePending;
    /** Exposed for tests — how many sign-ins are mid-flight. */
    pendingCount(): number;
    /**
     * Handle `GET <callbackPath>`: validate state, exchange the code, verify the
     * id_token, authorise the claims. Never throws — every failure comes back as
     * a reason code for the caller to log and swallow behind one 403.
     */
    handleCallback(req: Request, now?: number): Promise<CallbackSuccess | CallbackFailure>;
    private queryParam;
    /** Server-side code exchange — this is the only place the client secret is used. */
    private exchangeCode;
    /**
     * The authorisation decision, on already-signature-verified claims.
     *
     * `hd` AND the email suffix are both required. They normally agree, but they
     * are different assertions — `hd` is "this account belongs to that Workspace",
     * the suffix is "this address is in that domain" — and requiring both means a
     * single surprising claim shape cannot let an outsider in.
     */
    authorizeClaims(claims: IdTokenClaims): string;
    /** Domain + allowlist re-check, used when re-reading an existing cookie. */
    private emailAllowed;
}
