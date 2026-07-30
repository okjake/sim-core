import type { OpenApiDocument } from '../config';
import type { SimStorage } from '../storage/storage.service';
import type { Migration } from '../storage/storage.types';
import type { ChangelogEntry, Guide, SpecVersion, SpecVersionSummary } from './docs.types';
/**
 * Ordered and immutable. Adding a table or column means appending a new entry —
 * never editing a shipped one, because deployed sims already recorded it as
 * applied.
 */
export declare const DOCS_MIGRATIONS: Migration[];
export interface SpecVersionInput {
    label: string;
    spec: OpenApiDocument;
    /** Publish and activate immediately. Used by seeding. */
    publish?: boolean;
}
export interface GuideInput {
    slug: string;
    title: string;
    markdown: string;
    published?: boolean;
    order?: number;
}
export interface ChangelogEntryInput {
    id?: string;
    date: string;
    title: string;
    markdown: string;
    published?: boolean;
}
/** All docs SQL, in one place. No HTTP concepts, no rendering. */
export declare class DocsRepository {
    private readonly storage;
    constructor(storage: SimStorage);
    listSpecVersions(): SpecVersionSummary[];
    getSpecVersion(id: string): SpecVersion | null;
    getSpecVersionByLabel(label: string): SpecVersion | null;
    /** The one version `/openapi.json` serves, or null before anything is published. */
    getActiveSpecVersion(): SpecVersion | null;
    createSpecVersion(input: SpecVersionInput, now?: Date): SpecVersion;
    /** Drafts are freely editable; published versions are immutable history. */
    updateSpecVersion(id: string, patch: {
        label?: string;
        spec?: OpenApiDocument;
    }): SpecVersion;
    /**
     * Make `id` the active published version.
     *
     * `published_at` is stamped on every publish, including a republish of an
     * older version: what `/openapi.json` serves has changed as of now, and
     * `Last-Modified` must move or conditional-GET clients never re-fetch.
     */
    publishSpecVersion(id: string, now?: Date): SpecVersion;
    deleteSpecVersion(id: string): void;
    listGuides(onlyPublished?: boolean): Guide[];
    getGuide(slug: string): Guide | null;
    /** Insert or replace by slug. */
    upsertGuide(input: GuideInput, now?: Date): Guide;
    deleteGuide(slug: string): void;
    listChangelog(onlyPublished?: boolean): ChangelogEntry[];
    getChangelogEntry(id: string): ChangelogEntry | null;
    upsertChangelogEntry(input: ChangelogEntryInput, now?: Date): ChangelogEntry;
    deleteChangelogEntry(id: string): void;
    isEmpty(): boolean;
    counts(): {
        specVersions: number;
        guides: number;
        changelog: number;
    };
    /** Wipes every docs table. Only ever called by `POST /__control/reset-docs`. */
    wipe(): void;
}
