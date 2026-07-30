import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { RequestTailService } from './request-tail.service';

/**
 * Records every request — including 404s and requests that ended in an
 * exception filter — which is why this is middleware rather than an
 * interceptor.
 */
@Injectable()
export class RequestTailMiddleware implements NestMiddleware {
  constructor(private readonly tail: RequestTailService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const method = req.method;
    const path = req.path || (req.originalUrl ?? '').split('?')[0] || '/';

    res.on('finish', () => {
      const chaosHeader = res.getHeader('x-sim-chaos');
      this.tail.record({
        method,
        path,
        status: res.statusCode,
        latencyMs: Date.now() - startedAt,
        chaos:
          typeof chaosHeader === 'string' && chaosHeader.length > 0
            ? chaosHeader.split(',')
            : undefined,
      });
    });

    next();
  }
}
