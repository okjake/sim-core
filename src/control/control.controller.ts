import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Optional,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { DocsService } from '../docs/docs.service';
import type { SeedResult } from '../docs/docs.seed';
import {
  RequestTailService,
  type RequestTailEntry,
} from '../request-tail/request-tail.service';
import type { ScenarioListing } from '../scenarios/scenario.types';
import {
  WebhookRecorderService,
  type RecordedWebhook,
} from '../webhooks/webhook-recorder.service';
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
    private readonly webhooks: WebhookRecorderService,
    @Optional() private readonly docs?: DocsService,
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

  /**
   * Last N received webhooks, newest first. Always available — the recorder is
   * a few kB of memory and does not depend on the docs engine.
   */
  @Get('webhooks')
  webhookEvents(@Query('limit') limit?: string): {
    capacity: number;
    size: number;
    webhooks: RecordedWebhook[];
  } {
    const parsed = Number(limit);
    const bounded =
      Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : this.webhooks.capacity;
    return {
      capacity: this.webhooks.capacity,
      size: this.webhooks.size(),
      webhooks: this.webhooks.list(bounded),
    };
  }

  /**
   * Wipe the docs tables and reseed from the consumer's `content/` directory.
   *
   * Docs are durable state, so unlike scenarios this has no TTL and does not
   * auto-revert — it is the docs equivalent of `POST /__control/reset` and the
   * way to get a sim back to its checked-in baseline after an editing session.
   */
  @Post('reset-docs')
  @HttpCode(200)
  resetDocs(): SeedResult {
    if (!this.docs) {
      throw new NotFoundException({
        error: 'docs_disabled',
        message: 'This sim service does not have the docs engine enabled',
      });
    }
    return this.docs.resetDocs();
  }
}
