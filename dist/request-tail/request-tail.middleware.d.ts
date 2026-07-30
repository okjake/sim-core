import { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestTailService } from './request-tail.service';
/**
 * Records every request — including 404s and requests that ended in an
 * exception filter — which is why this is middleware rather than an
 * interceptor.
 */
export declare class RequestTailMiddleware implements NestMiddleware {
    private readonly tail;
    constructor(tail: RequestTailService);
    use(req: Request, res: Response, next: NextFunction): void;
}
