"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuthError = void 0;
/** Internal error carrying an {@link AdminAuthFailure}. Not exported to the wire. */
class AdminAuthError extends Error {
    reason;
    constructor(reason, message) {
        super(message ?? reason);
        this.reason = reason;
        this.name = 'AdminAuthError';
    }
}
exports.AdminAuthError = AdminAuthError;
