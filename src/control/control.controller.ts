import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import {
  RequestTailService,
  type RequestTailEntry,
} from '../request-tail/request-tail.service';
import type { ScenarioListing } from '../scenarios/scenario.types';
import { parseActivateScenarioBody, parseDriverOverrideBody } from './control.dto';
import { ControlAuthGuard } from './control.guard';
import { ControlService, type ControlState } from './control.service';

/**
 * The control plane. Every route requires `Authorization: Bearer ${CONTROL_TOKEN}`.
 * Deliberately NOT part of `/openapi.json` — see OpenApiController.
 */
@Controller('__control')
@UseGuards(ControlAuthGuard)
export class ControlController {
  constructor(
    private readonly control: ControlService,
    private readonly tail: RequestTailService,
  ) {}

  @Get('state')
  state(): ControlState {
    return this.control.state();
  }

  @Get('scenarios')
  scenarios(): { scenarios: ScenarioListing[] } {
    return { scenarios: this.control.listScenarios() };
  }

  /** Additive to the spec table: the admin SPA's request-tail view reads this. */
  @Get('requests')
  requests(@Query('limit') limit?: string): { requests: RequestTailEntry[] } {
    const parsed = Number(limit);
    const bounded = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 50;
    return { requests: this.tail.list(bounded) };
  }

  @Post('scenario')
  activate(@Body() body: unknown): Promise<ControlState> {
    return this.control.activateScenario(parseActivateScenarioBody(body));
  }

  @Post('driver')
  driver(@Body() body: unknown): ControlState {
    return this.control.setDriverOverride(parseDriverOverrideBody(body));
  }

  @Post('reset')
  reset(): Promise<ControlState> {
    return this.control.reset();
  }
}
