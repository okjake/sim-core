import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { ControlAuthGuard } from '../control/control.guard';
import {
  parseChangelogBody,
  parseCreateSpecVersionBody,
  parseGuideBody,
  parsePreviewBody,
  parseUpdateSpecVersionBody,
} from './docs.dto';
import { renderMarkdown } from './markdown';
import { DocsService, type DocsStatus } from './docs.service';
import type {
  ChangelogEntry,
  Guide,
  SpecVersion,
  SpecVersionSummary,
} from './docs.types';

/**
 * The docs editor's backend, behind the same bearer token as the rest of the
 * control plane. Registered only when `docs.enabled` is true; a docs-disabled
 * service 404s these paths, which is how the admin SPA decides whether to show
 * the Docs tab.
 *
 * Drafts and unpublished guides ARE visible here — that is the difference
 * between the control plane and the public `/docs` surface.
 */
@Controller('__control/docs')
@UseGuards(ControlAuthGuard)
export class DocsControlController {
  constructor(private readonly docs: DocsService) {}

  @Get()
  status(): DocsStatus {
    return this.docs.status();
  }

  // ------------------------------------------------------------ spec versions

  @Get('spec-versions')
  listSpecVersions(): { specVersions: SpecVersionSummary[] } {
    return { specVersions: this.docs.listSpecVersions() };
  }

  @Get('spec-versions/:id')
  getSpecVersion(@Param('id') id: string): SpecVersion {
    return this.docs.getSpecVersion(id);
  }

  @Post('spec-versions')
  createSpecVersion(@Body() body: unknown): SpecVersion {
    const input = parseCreateSpecVersionBody(body);
    const created = input.spec
      ? this.docs.createSpecVersion({ label: input.label, spec: input.spec })
      : this.docs.draftFromActive(input.label);
    return input.publish ? this.docs.publishSpecVersion(created.id) : created;
  }

  @Patch('spec-versions/:id')
  updateSpecVersion(@Param('id') id: string, @Body() body: unknown): SpecVersion {
    return this.docs.updateSpecVersion(id, parseUpdateSpecVersionBody(body));
  }

  @Post('spec-versions/:id/publish')
  publishSpecVersion(@Param('id') id: string): SpecVersion {
    return this.docs.publishSpecVersion(id);
  }

  @Delete('spec-versions/:id')
  @HttpCode(200)
  deleteSpecVersion(@Param('id') id: string): { deleted: string } {
    this.docs.deleteSpecVersion(id);
    return { deleted: id };
  }

  // ------------------------------------------------------------------- guides

  @Get('guides')
  listGuides(): { guides: Guide[] } {
    return { guides: this.docs.listGuides() };
  }

  @Get('guides/:slug')
  getGuide(@Param('slug') slug: string): Guide {
    return this.docs.getGuide(slug);
  }

  @Put('guides/:slug')
  @HttpCode(200)
  upsertGuide(@Param('slug') slug: string, @Body() body: unknown): Guide {
    return this.docs.upsertGuide(parseGuideBody(body, slug));
  }

  @Post('guides')
  createGuide(@Body() body: unknown): Guide {
    return this.docs.upsertGuide(parseGuideBody(body));
  }

  @Delete('guides/:slug')
  @HttpCode(200)
  deleteGuide(@Param('slug') slug: string): { deleted: string } {
    this.docs.deleteGuide(slug);
    return { deleted: slug };
  }

  // ---------------------------------------------------------------- changelog

  @Get('changelog')
  listChangelog(): { changelog: ChangelogEntry[] } {
    return { changelog: this.docs.listChangelog() };
  }

  @Post('changelog')
  createChangelogEntry(@Body() body: unknown): ChangelogEntry {
    return this.docs.upsertChangelogEntry(parseChangelogBody(body));
  }

  @Put('changelog/:id')
  @HttpCode(200)
  upsertChangelogEntry(@Param('id') id: string, @Body() body: unknown): ChangelogEntry {
    return this.docs.upsertChangelogEntry(parseChangelogBody(body, id));
  }

  @Delete('changelog/:id')
  @HttpCode(200)
  deleteChangelogEntry(@Param('id') id: string): { deleted: string } {
    this.docs.deleteChangelogEntry(id);
    return { deleted: id };
  }

  // ------------------------------------------------------------------ preview

  /**
   * Render markdown with the *same* renderer the public pages use, so the
   * editor preview cannot drift from what will actually be published.
   */
  @Post('preview')
  @HttpCode(200)
  preview(@Body() body: unknown): { html: string } {
    return { html: renderMarkdown(parsePreviewBody(body)) };
  }
}
