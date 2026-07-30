import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

import { SIM_CORE_CONFIG, type OpenApiDocument, type SimCoreConfig } from '../config';

/** The control plane is never part of a sim company's published contract. */
export function stripControlPaths(doc: OpenApiDocument): OpenApiDocument {
  if (!doc.paths) return doc;
  const paths = Object.fromEntries(
    Object.entries(doc.paths).filter(([path]) => !path.startsWith('/__control')),
  );
  return { ...doc, paths };
}

@Controller()
export class OpenApiController {
  private readonly document: OpenApiDocument;
  private readonly body: string;
  private readonly etag: string;
  private readonly lastModified: string;

  constructor(@Inject(SIM_CORE_CONFIG) config: SimCoreConfig) {
    this.document = stripControlPaths(config.openapi);
    this.body = JSON.stringify(this.document);
    this.etag = `"${createHash('sha256').update(this.body).digest('hex').slice(0, 32)}"`;
    this.lastModified = new Date().toUTCString();
  }

  @Get('openapi.json')
  serve(@Req() req: Request, @Res() res: Response): void {
    res.setHeader('etag', this.etag);
    res.setHeader('last-modified', this.lastModified);
    res.setHeader('cache-control', 'public, max-age=60');
    res.setHeader('content-type', 'application/json; charset=utf-8');

    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch.split(',').some((tag) => tag.trim() === this.etag)) {
      res.status(304).end();
      return;
    }

    res.status(200).send(this.body);
  }
}
