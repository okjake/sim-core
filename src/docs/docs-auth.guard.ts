import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { SIM_CORE_CONFIG, type SimCoreConfig } from '../config';
import { DocsService } from './docs.service';

/**
 * Gate for the public docs surface.
 *
 * `authMode: 'public'` (the default) lets everything through. `'required'`
 * hands the request to the consumer's own `docsAuthCheck` — sim-core has no
 * opinion about the credential scheme, because the whole point for
 * sim-pebblepay is that the scheme is switchable (bearer / basic / custom
 * header) and can be made to fail on demand by a `credential-expiry` scenario.
 *
 * A `'required'` mode with no `docsAuthCheck` configured fails closed. Silently
 * serving docs that were meant to be credentialed would be the worse bug.
 */
@Injectable()
export class DocsAuthGuard implements CanActivate {
  constructor(
    @Inject(SIM_CORE_CONFIG) private readonly config: SimCoreConfig,
    private readonly docs: DocsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.docs.config.authMode !== 'required') {
      return true;
    }

    const check = this.config.docsAuthCheck;
    if (typeof check !== 'function') {
      throw new UnauthorizedException({
        error: 'docs_auth_not_configured',
        message:
          "docs.authMode is 'required' but no docsAuthCheck was supplied — failing closed",
      });
    }

    const req = context.switchToHttp().getRequest<Request>();
    let allowed: boolean;
    try {
      // A consumer check that throws is a failed check, not a 500.
      allowed = check(req) === true;
    } catch {
      allowed = false;
    }

    if (!allowed) {
      throw new UnauthorizedException({
        error: 'docs_unauthorized',
        message: 'Valid credentials are required to read these docs',
      });
    }
    return true;
  }
}
