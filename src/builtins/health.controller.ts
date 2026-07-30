import { Controller, Get, Inject } from '@nestjs/common';

import { SIM_CORE_CONFIG, type SimCoreConfig } from '../config';

export interface HealthPayload {
  status: 'ok';
  /** Process uptime in seconds. */
  uptime: number;
  version: string;
}

@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(@Inject(SIM_CORE_CONFIG) private readonly config: SimCoreConfig) {}

  @Get('health')
  health(): HealthPayload {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      version: this.config.version ?? '0.0.0',
    };
  }
}
