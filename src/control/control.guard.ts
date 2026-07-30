import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { SIM_CORE_CONFIG, type SimCoreConfig } from '../config';

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

/** `Authorization: Bearer ${CONTROL_TOKEN}` on every `/__control/*` route. 401 otherwise. */
@Injectable()
export class ControlAuthGuard implements CanActivate {
  constructor(@Inject(SIM_CORE_CONFIG) private readonly config: SimCoreConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? '';
    const [scheme, ...rest] = header.split(' ');
    const token = rest.join(' ').trim();

    if (!scheme || scheme.toLowerCase() !== 'bearer' || token.length === 0) {
      throw new UnauthorizedException('Missing control bearer token');
    }
    if (!safeEqual(token, this.config.controlToken)) {
      throw new UnauthorizedException('Invalid control bearer token');
    }
    return true;
  }
}
