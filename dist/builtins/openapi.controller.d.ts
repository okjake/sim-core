import type { Request, Response } from 'express';
import { type OpenApiDocument, type SimCoreConfig } from '../config';
/** The control plane is never part of a sim company's published contract. */
export declare function stripControlPaths(doc: OpenApiDocument): OpenApiDocument;
export declare class OpenApiController {
    private readonly document;
    private readonly body;
    private readonly etag;
    private readonly lastModified;
    constructor(config: SimCoreConfig);
    serve(req: Request, res: Response): void;
}
