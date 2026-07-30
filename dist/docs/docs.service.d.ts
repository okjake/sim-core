import { OnModuleDestroy } from '@nestjs/common';
import { type OpenApiDocument, type SimCoreConfig } from '../config';
import { DocsRepository, type ChangelogEntryInput, type GuideInput, type SpecVersionInput } from './docs.repository';
import { type SeedResult } from './docs.seed';
import type { ChangelogEntry, DocsConfig, Guide, ServedSpec, SpecVersion, SpecVersionSummary } from './docs.types';
/** Same 32-hex shape v0.1.0 used, so consumers' ETag assertions keep passing. */
export declare function contentEtag(body: string): string;
export interface DocsStatus {
    enabled: true;
    authMode: 'public' | 'required';
    databaseFile: string;
    contentDir: string;
    chaosOptIn: boolean;
    counts: {
        specVersions: number;
        guides: number;
        changelog: number;
    };
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
export declare class DocsService implements OnModuleDestroy {
    private readonly simConfig;
    private readonly logger;
    private readonly storage;
    private readonly fallback;
    readonly repo: DocsRepository;
    readonly config: Required<Pick<DocsConfig, 'authMode' | 'contentDir' | 'seedOnBoot'>> & DocsConfig;
    readonly siteTitle: string;
    readonly contentDir: string;
    /** Recomputed on publish, not per request. */
    private served;
    private seedResult;
    constructor(simConfig: SimCoreConfig);
    onModuleDestroy(): void;
    /** Cached body + validators for `GET /openapi.json`. */
    activeSpec(): ServedSpec;
    /** Call after anything that could change which spec version is active. */
    refreshServedSpec(): ServedSpec;
    listSpecVersions(): SpecVersionSummary[];
    getSpecVersion(id: string): SpecVersion;
    createSpecVersion(input: SpecVersionInput): SpecVersion;
    /** Seed a draft from whatever is currently active (or from `config.openapi`). */
    draftFromActive(label: string): SpecVersion;
    updateSpecVersion(id: string, patch: {
        label?: string;
        spec?: OpenApiDocument;
    }): SpecVersion;
    publishSpecVersion(id: string): SpecVersion;
    /** Publish by label — how a consumer scenario activates a checked-in preset. */
    publishSpecVersionByLabel(label: string): SpecVersion;
    deleteSpecVersion(id: string): void;
    listGuides(onlyPublished?: boolean): Guide[];
    getGuide(slug: string): Guide;
    upsertGuide(input: GuideInput): Guide;
    deleteGuide(slug: string): void;
    listChangelog(onlyPublished?: boolean): ChangelogEntry[];
    upsertChangelogEntry(input: ChangelogEntryInput): ChangelogEntry;
    deleteChangelogEntry(id: string): void;
    /** Wipe every docs table and reseed from `content/`. */
    resetDocs(): SeedResult;
    lastSeed(): SeedResult | null;
    private get accent();
    renderIndex(): string;
    /** Drafts 404 on the public surface — that is the whole point of the split. */
    renderGuide(slug: string): {
        html: string;
        found: boolean;
    };
    renderChangelog(): string;
    status(): DocsStatus;
}
