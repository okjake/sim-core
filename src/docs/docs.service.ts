import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { SIM_CORE_CONFIG, type OpenApiDocument, type SimCoreConfig } from '../config';
import { httpDate } from '../http/conditional';
import { stripControlPaths } from '../builtins/openapi.controller';
import { SimStorage } from '../storage/storage.service';
import {
  DOCS_MIGRATIONS,
  DocsRepository,
  type ChangelogEntryInput,
  type GuideInput,
  type SpecVersionInput,
} from './docs.repository';
import {
  renderChangelogPage,
  renderReferencePage,
  renderDocsIndex,
  renderGuidePage,
  renderNotFoundPage,
} from './docs.render';
import { seedFromContent, type SeedResult } from './docs.seed';
import type {
  ChangelogEntry,
  DocsConfig,
  Guide,
  ServedSpec,
  SpecVersion,
  SpecVersionSummary,
} from './docs.types';

/** Same 32-hex shape v0.1.0 used, so consumers' ETag assertions keep passing. */
export function contentEtag(body: string): string {
  return `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`;
}

export interface DocsStatus {
  enabled: true;
  authMode: 'public' | 'required';
  databaseFile: string;
  contentDir: string;
  chaosOptIn: boolean;
  counts: { specVersions: number; guides: number; changelog: number };
  activeSpec: SpecVersionSummary | null;
  migrations: string[];
}

/**
 * The docs engine.
 *
 * Only instantiated when `config.docs.enabled` is true — a v0.1.0-style
 * consumer never loads it, never opens SQLite, and keeps serving
 * `config.openapi` verbatim from `OpenApiController`.
 */
@Injectable()
export class DocsService implements OnModuleDestroy {
  private readonly logger = new Logger('SimDocs');
  private readonly storage: SimStorage;
  private readonly fallback: ServedSpec;

  readonly repo: DocsRepository;
  readonly config: Required<Pick<DocsConfig, 'authMode' | 'contentDir' | 'seedOnBoot'>> &
    DocsConfig;
  readonly siteTitle: string;
  readonly contentDir: string;

  /** Recomputed on publish, not per request. */
  private served: ServedSpec | null = null;
  private seedResult: SeedResult | null = null;

  constructor(@Inject(SIM_CORE_CONFIG) private readonly simConfig: SimCoreConfig) {
    const docs = simConfig.docs ?? {};
    this.config = {
      ...docs,
      authMode: docs.authMode ?? 'public',
      contentDir: docs.contentDir ?? resolve(process.cwd(), 'content'),
      seedOnBoot: docs.seedOnBoot ?? true,
    };
    this.contentDir = this.config.contentDir;
    this.siteTitle =
      docs.title ?? `${simConfig.brand?.displayName ?? simConfig.name} developer docs`;

    this.storage = new SimStorage({
      file: docs.databaseFile,
      dataDir: docs.dataDir,
      driver: docs.databaseDriver,
      migrations: DOCS_MIGRATIONS,
    });
    this.repo = new DocsRepository(this.storage);

    // The static config spec is the safety net: a sim always serves *something*
    // at /openapi.json, even before the first publish.
    const body = JSON.stringify(stripControlPaths(simConfig.openapi));
    const bootedAt = Date.now();
    this.fallback = {
      body,
      etag: contentEtag(body),
      lastModified: httpDate(bootedAt),
      lastModifiedMs: bootedAt,
      version: null,
    };

    if (this.config.seedOnBoot && this.repo.isEmpty()) {
      this.seedResult = seedFromContent(this.repo, this.contentDir, this.logger);
    }
    this.refreshServedSpec();
  }

  onModuleDestroy(): void {
    this.storage.close();
  }

  // ------------------------------------------------------------------ openapi

  /** Cached body + validators for `GET /openapi.json`. */
  activeSpec(): ServedSpec {
    return this.served ?? this.fallback;
  }

  /** Call after anything that could change which spec version is active. */
  refreshServedSpec(): ServedSpec {
    const active = this.repo.getActiveSpecVersion();
    if (!active || active.publishedAt === null) {
      this.served = null;
      return this.fallback;
    }

    const body = JSON.stringify(stripControlPaths(active.spec));
    const publishedMs = Date.parse(active.publishedAt);
    const lastModifiedMs = Number.isNaN(publishedMs) ? Date.now() : publishedMs;

    this.served = {
      body,
      etag: contentEtag(body),
      lastModified: httpDate(lastModifiedMs),
      lastModifiedMs,
      version: {
        id: active.id,
        label: active.label,
        createdAt: active.createdAt,
        publishedAt: active.publishedAt,
        active: true,
      },
    };
    return this.served;
  }

  // ------------------------------------------------------------ spec versions

  listSpecVersions(): SpecVersionSummary[] {
    return this.repo.listSpecVersions();
  }

  getSpecVersion(id: string): SpecVersion {
    const version = this.repo.getSpecVersion(id);
    if (!version) {
      throw new NotFoundException({
        error: 'unknown_spec_version',
        message: `No spec version with id "${id}"`,
      });
    }
    return version;
  }

  createSpecVersion(input: SpecVersionInput): SpecVersion {
    const created = this.repo.createSpecVersion(input);
    if (created.active) this.refreshServedSpec();
    return created;
  }

  /** Seed a draft from whatever is currently active (or from `config.openapi`). */
  draftFromActive(label: string): SpecVersion {
    const active = this.repo.getActiveSpecVersion();
    const spec: OpenApiDocument = active ? active.spec : this.simConfig.openapi;
    return this.createSpecVersion({ label, spec });
  }

  updateSpecVersion(id: string, patch: { label?: string; spec?: OpenApiDocument }): SpecVersion {
    return this.repo.updateSpecVersion(id, patch);
  }

  publishSpecVersion(id: string): SpecVersion {
    const published = this.repo.publishSpecVersion(id);
    this.refreshServedSpec();
    this.logger.log(`published spec version "${published.label}" (${published.id})`);
    return published;
  }

  /** Publish by label — how a consumer scenario activates a checked-in preset. */
  publishSpecVersionByLabel(label: string): SpecVersion {
    const version = this.repo.getSpecVersionByLabel(label);
    if (!version) {
      throw new NotFoundException({
        error: 'unknown_spec_version',
        message: `No spec version labelled "${label}"`,
        available: this.repo.listSpecVersions().map((v) => v.label),
      });
    }
    return this.publishSpecVersion(version.id);
  }

  deleteSpecVersion(id: string): void {
    this.repo.deleteSpecVersion(id);
  }

  // -------------------------------------------------------- guides + changelog

  listGuides(onlyPublished = false): Guide[] {
    return this.repo.listGuides(onlyPublished);
  }

  getGuide(slug: string): Guide {
    const guide = this.repo.getGuide(slug);
    if (!guide) {
      throw new NotFoundException({
        error: 'unknown_guide',
        message: `No guide with slug "${slug}"`,
      });
    }
    return guide;
  }

  upsertGuide(input: GuideInput): Guide {
    return this.repo.upsertGuide(input);
  }

  deleteGuide(slug: string): void {
    this.repo.deleteGuide(slug);
  }

  listChangelog(onlyPublished = false): ChangelogEntry[] {
    return this.repo.listChangelog(onlyPublished);
  }

  upsertChangelogEntry(input: ChangelogEntryInput): ChangelogEntry {
    return this.repo.upsertChangelogEntry(input);
  }

  deleteChangelogEntry(id: string): void {
    this.repo.deleteChangelogEntry(id);
  }

  // ------------------------------------------------------------------ seeding

  /** Wipe every docs table and reseed from `content/`. */
  resetDocs(): SeedResult {
    this.repo.wipe();
    this.seedResult = seedFromContent(this.repo, this.contentDir, this.logger);
    this.refreshServedSpec();
    this.logger.log('docs reset — tables wiped and reseeded from content/');
    return this.seedResult;
  }

  lastSeed(): SeedResult | null {
    return this.seedResult;
  }

  // ------------------------------------------------------------------ rendering

  private get accent(): string {
    return this.simConfig.brand?.color ?? '#3b6ea5';
  }

  renderIndex(): string {
    const active = this.repo.getActiveSpecVersion();
    return renderDocsIndex({
      siteTitle: this.siteTitle,
      accent: this.accent,
      intro: this.config.intro,
      activeSpecLabel: active?.label ?? null,
      guides: this.repo.listGuides(true),
      hasChangelog: this.repo.listChangelog(true).length > 0,
    });
  }

  renderReference(): string {
    const active = this.repo.getActiveSpecVersion();
    return renderReferencePage({
      siteTitle: this.siteTitle,
      accent: this.accent,
      activeSpecLabel: active?.label ?? null,
    });
  }

  /** Drafts 404 on the public surface — that is the whole point of the split. */
  renderGuide(slug: string): { html: string; found: boolean } {
    const guide = this.repo.getGuide(slug);
    if (!guide || !guide.published) {
      return {
        html: renderNotFoundPage(
          this.siteTitle,
          this.accent,
          `There is no published guide at /docs/guides/${slug}.`,
        ),
        found: false,
      };
    }
    return {
      html: renderGuidePage({ siteTitle: this.siteTitle, accent: this.accent, guide }),
      found: true,
    };
  }

  renderChangelog(): string {
    return renderChangelogPage({
      siteTitle: this.siteTitle,
      accent: this.accent,
      entries: this.repo.listChangelog(true),
    });
  }

  // -------------------------------------------------------------------- status

  status(): DocsStatus {
    return {
      enabled: true,
      authMode: this.config.authMode,
      databaseFile: this.storage.file,
      contentDir: this.contentDir,
      chaosOptIn: this.simConfig.docsChaosOptIn === true,
      counts: this.repo.counts(),
      activeSpec: this.activeSpec().version,
      migrations: this.storage.applied().map((m) => m.id),
    };
  }
}
