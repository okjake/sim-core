import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { DocsAuthGuard } from './docs-auth.guard';
import { DocsService } from './docs.service';

/**
 * The public docs surface. Registered only when `docs.enabled` is true.
 *
 * Pages are sent with `Cache-Control: no-cache` rather than a max-age: they are
 * cheap to render and the platform wants to see a publish immediately, not
 * after a TTL. `/openapi.json` is the endpoint with real validators — it lives
 * in `OpenApiController`, which delegates here when docs are on.
 */
@Controller('docs')
@UseGuards(DocsAuthGuard)
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  private send(res: Response, html: string, status = 200): void {
    res.status(status);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-cache');
    res.send(html);
  }

  @Get()
  index(@Res() res: Response): void {
    this.send(res, this.docs.renderIndex());
  }

  @Get('changelog')
  changelog(@Res() res: Response): void {
    this.send(res, this.docs.renderChangelog());
  }

  @Get('guides/:slug')
  guide(@Param('slug') slug: string, @Res() res: Response): void {
    const { html, found } = this.docs.renderGuide(slug);
    this.send(res, html, found ? 200 : 404);
  }
}
