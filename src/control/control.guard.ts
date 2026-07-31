import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { SIM_CORE_CONFIG, type SimCoreConfig } from '../config';
import { AdminAuthService } from '../admin-auth/admin-auth.service';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so length isn't leaked by timing alone.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

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
@Injectable()
export class ControlAuthGuard implements CanActivate {
  constructor(
    @Inject(SIM_CORE_CONFIG) private readonly config: SimCoreConfig,
    @Optional() private readonly adminAuth?: AdminAuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    if (this.bearerMatches(req)) {
      return true;
    }
    if (this.adminAuth?.isEnabled() && this.adminAuth.authenticate(req)) {
      return true;
    }
    throw new UnauthorizedException('Missing or invalid control credentials');
  }

  private bearerMatches(req: Request): boolean {
    const header = req.headers.authorization ?? '';
    const [scheme, ...rest] = header.split(' ');
    const token = rest.join(' ').trim();
    if (!scheme || scheme.toLowerCase() !== 'bearer' || token.length === 0) {
      return false;
    }
    return safeEqual(token, this.config.controlToken);
  }
}
