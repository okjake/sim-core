import { CanActivate, ExecutionContext } from '@nestjs/common';
import { type SimCoreConfig } from '../config';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
/**
 * Authorizes every `/__control/*` route on EITHER of two credentials:
 *
 * 1. `Authorization: Bearer ${CONTROL_TOKEN}` — unchanged, and the only
 *    option when `adminAuth` is off or absent. This is what every piece of
 *    fleet automation (scripts, CI, the eventual agent pipeline) uses; none
 *    of it can carry a browser cookie.
 * 2. A valid `adminAuth` session cookie — checked only when `adminAuth` is
 *    enabled on this service. Signing in with Google is, by design, now
 *    sufficient to operate the control plane: there is no longer a second
 *    "can view" vs. "can mutate" tier for humans. Re-tightening
 *    `allowedDomain` or `allowedEmails` and redeploying revokes this
 *    immediately, the same as it already does for `/admin` itself
 *    ({@link AdminAuthService.authenticate}).
 *
 * CSRF is not a new concern this introduces: every mutating route here is
 * POST/PUT/PATCH/DELETE, the cookie is `SameSite=Lax`, and Lax cookies are
 * withheld from cross-site requests for every method except a top-level *GET*
 * navigation (a clicked link) — which none of these routes accept anyway. A
 * foreign page's `fetch`, `XHR`, or `<form>` POST to this origin carries no
 * cookie at all under Lax.
 */
export declare class ControlAuthGuard implements CanActivate {
    private readonly config;
    private readonly adminAuth?;
    constructor(config: SimCoreConfig, adminAuth?: AdminAuthService | undefined);
    canActivate(context: ExecutionContext): boolean;
    private bearerMatches;
}
