import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { WebhookRecorderService, assertPlatformWebhook } from '../../src';

/** Test/demo secret. A real consumer reads this from `WEBHOOK_SECRET`. */
export const DEMO_WEBHOOK_SECRET = 'demo-webhook-secret-0123456789';

/**
 * The receiver recipe, in full.
 *
 * Three things matter and all three are here:
 *
 * 1. The app must be created with `rawBody: true` (see `bootstrapSimService`),
 *    or `assertPlatformWebhook` has no bytes to verify and 401s with
 *    `reason: 'no-raw-body'`.
 * 2. Verify BEFORE doing anything with the payload, and let the
 *    `UnauthorizedException` become a 401.
 * 3. Record, then respond immediately. The platform retries on a slow or
 *    non-2xx response, so any real work belongs after the response, not
 *    before it.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly recorder: WebhookRecorderService) {}

  @Post('platform')
  @HttpCode(200)
  receive(@Req() req: Request): { received: true } {
    let body: unknown;
    try {
      ({ body } = assertPlatformWebhook(req, { secret: DEMO_WEBHOOK_SECRET }));
    } catch (error) {
      // Record the rejection too — "did the delivery even arrive?" is the
      // first question asked when a signature mismatch is being debugged.
      this.recorder.record({ path: '/webhooks/platform', verified: false, status: 401 });
      throw error;
    }

    this.recorder.record({ path: '/webhooks/platform', verified: true, status: 200, body });
    return { received: true };
  }
}
