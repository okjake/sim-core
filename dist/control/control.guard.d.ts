import { CanActivate, ExecutionContext } from '@nestjs/common';
import { type SimCoreConfig } from '../config';
/** `Authorization: Bearer ${CONTROL_TOKEN}` on every `/__control/*` route. 401 otherwise. */
export declare class ControlAuthGuard implements CanActivate {
    private readonly config;
    constructor(config: SimCoreConfig);
    canActivate(context: ExecutionContext): boolean;
}
