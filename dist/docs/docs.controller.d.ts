import type { Response } from 'express';
import { DocsService } from './docs.service';
/**
 * The public docs surface. Registered only when `docs.enabled` is true.
 *
 * Pages are sent with `Cache-Control: no-cache` rather than a max-age: they are
 * cheap to render and the platform wants to see a publish immediately, not
 * after a TTL. `/openapi.json` is the endpoint with real validators — it lives
 * in `OpenApiController`, which delegates here when docs are on.
 */
export declare class DocsController {
    private readonly docs;
    constructor(docs: DocsService);
    private send;
    index(res: Response): void;
    changelog(res: Response): void;
    guide(slug: string, res: Response): void;
}
