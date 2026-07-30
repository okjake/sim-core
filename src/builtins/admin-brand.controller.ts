import { Controller, Get, Inject } from '@nestjs/common';

import { SIM_CORE_CONFIG, type SimBrand, type SimCoreConfig } from '../config';

export interface AdminBrandPayload {
  name: string;
  version: string;
  brand: SimBrand;
  /** Whether a traffic driver exists, so the SPA can hide driver controls. */
  driver: boolean;
  /** Whether the docs engine is on, so the SPA can hide the Docs tab. */
  docs: boolean;
}

/**
 * Unauthenticated, display-only metadata for the admin SPA's shell (title,
 * theme colour) — needed before a control token has been entered. Contains no
 * secrets and no runtime state.
 */
@Controller('__admin')
export class AdminBrandController {
  constructor(@Inject(SIM_CORE_CONFIG) private readonly config: SimCoreConfig) {}

  @Get('brand')
  brand(): AdminBrandPayload {
    return {
      name: this.config.name,
      version: this.config.version ?? '0.0.0',
      brand: this.config.brand,
      driver: Boolean(this.config.driver),
      docs: this.config.docs?.enabled === true,
    };
  }
}
