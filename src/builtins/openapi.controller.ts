import { Controller, Get, Inject, Optional, Req, Res } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

import { SIM_CORE_CONFIG, type OpenApiDocument, type SimCoreConfig } from '../config';
import { httpDate, isNotModified } from '../http/conditional';

/** The control plane is never part of a sim company's published contract. */
export function stripControlPaths(doc: OpenApiDocument): OpenApiDocument {
  if (!doc.paths) return doc;
  const paths = Object.fromEntries(
    Object.entries(doc.paths).filter(([path]) => !path.startsWith('/__control')),
  );
  return { ...doc, paths };
}

/**
 * Minimal structural view of `DocsService`.
 *
 * Injected by token rather than by class so this controller — which every
 * consumer gets — never pulls the docs engine (and therefore SQLite) into the
 * module graph of a service that has docs turned off.
 */
export interface ActiveSpecSource {
  activeSpec(): {
    body: string;
    etag: string;
    lastModified: string;
    lastModifiedMs: number;
  };
}

/** DI token for the optional {@link ActiveSpecSource}. */
export const ACTIVE_SPEC_SOURCE = 'SIM_ACTIVE_SPEC_SOURCE';

/**
 * `GET /openapi.json`.
 *
 * With docs disabled (the v0.1.0 default) this serves `config.openapi`,
 * hashed once at construction. With docs enabled it serves the ACTIVE
 * published spec version, whose ETag and `Last-Modified` move on every
 * publish. Both paths answer `If-None-Match` and `If-Modified-Since`.
 */
@Controller()
export class OpenApiController {
  private readonly body: string;
  private readonly etag: string;
  private readonly lastModifiedMs: number;
  private readonly lastModified: string;

  constructor(
    @Inject(SIM_CORE_CONFIG) config: SimCoreConfig,
    @Optional() @Inject(ACTIVE_SPEC_SOURCE) private readonly docs?: ActiveSpecSource,
  ) {
    this.body = JSON.stringify(stripControlPaths(config.openapi));
    this.etag = `"${createHash('sha256').update(this.body).digest('hex').slice(0, 32)}"`;
    this.lastModifiedMs = Date.now();
    this.lastModified = httpDate(this.lastModifiedMs);
  }

  private current(): {
    body: string;
    etag: string;
    lastModified: string;
    lastModifiedMs: number;
  } {
    if (this.docs) return this.docs.activeSpec();
    return {
      body: this.body,
      etag: this.etag,
      lastModified: this.lastModified,
      lastModifiedMs: this.lastModifiedMs,
    };
  }

  @Get('openapi.json')
  serve(@Req() req: Request, @Res() res: Response): void {
    const spec = this.current();

    res.setHeader('etag', spec.etag);
    res.setHeader('last-modified', spec.lastModified);
    res.setHeader('cache-control', 'public, max-age=60');
    res.setHeader('content-type', 'application/json; charset=utf-8');

    if (isNotModified(req, { etag: spec.etag, lastModified: spec.lastModifiedMs })) {
      res.status(304).end();
      return;
    }

    res.status(200).send(spec.body);
  }
}
