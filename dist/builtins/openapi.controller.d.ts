import type { Request, Response } from 'express';
import { type OpenApiDocument, type SimCoreConfig } from '../config';
/** The control plane is never part of a sim company's published contract. */
export declare function stripControlPaths(doc: OpenApiDocument): OpenApiDocument;
/**
 * Minimal structural view of `DocsService`.
 *
 * Injected by token rather than by class so this controller — which every
 * consumer gets — never pulls the docs engine (and therefore SQLite) into the
 * module graph of a service that has docs turned off.
 */
export interface ActiveSpecSource {
    activeSpec(): {
        body: string;
        etag: string;
        lastModified: string;
        lastModifiedMs: number;
    };
}
/** DI token for the optional {@link ActiveSpecSource}. */
export declare const ACTIVE_SPEC_SOURCE = "SIM_ACTIVE_SPEC_SOURCE";
/**
 * `GET /openapi.json`.
 *
 * With docs disabled (the v0.1.0 default) this serves `config.openapi`,
 * hashed once at construction. With docs enabled it serves the ACTIVE
 * published spec version, whose ETag and `Last-Modified` move on every
 * publish. Both paths answer `If-None-Match` and `If-Modified-Since`.
 */
export declare class OpenApiController {
    private readonly docs?;
    private readonly body;
    private readonly etag;
    private readonly lastModifiedMs;
    private readonly lastModified;
    constructor(config: SimCoreConfig, docs?: ActiveSpecSource | undefined);
    private current;
    serve(req: Request, res: Response): void;
}
