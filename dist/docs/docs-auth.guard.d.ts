import { CanActivate, ExecutionContext } from '@nestjs/common';
import { type SimCoreConfig } from '../config';
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
export declare class DocsAuthGuard implements CanActivate {
    private readonly config;
    private readonly docs;
    constructor(config: SimCoreConfig, docs: DocsService);
    canActivate(context: ExecutionContext): boolean;
}
