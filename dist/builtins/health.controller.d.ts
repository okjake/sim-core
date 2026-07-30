import { type SimCoreConfig } from '../config';
export interface HealthPayload {
    status: 'ok';
    /** Process uptime in seconds. */
    uptime: number;
    version: string;
}
export declare class HealthController {
    private readonly config;
    private readonly startedAt;
    constructor(config: SimCoreConfig);
    health(): HealthPayload;
}
