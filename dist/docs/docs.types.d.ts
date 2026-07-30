import type { Request } from 'express';
import type { OpenApiDocument } from '../config';
import type { SqlDatabaseFactory } from '../storage/storage.types';
/**
 * A versioned copy of the service's OpenAPI document.
 *
 * Drafts (`publishedAt === null`) are invisible on the public surface. Exactly
 * one row may be `active` at a time — enforced by a partial unique index, not
 * just by application code.
 */
export interface SpecVersion {
    id: string;
    /** Unique, human-chosen, URL-safe-ish, e.g. `baseline`, `2026-07-additive`. */
    label: string;
    spec: OpenApiDocument;
    createdAt: string;
    /** ISO-8601, or null while it is still a draft. */
    publishedAt: string | null;
    /** The one version `GET /openapi.json` serves. */
    active: boolean;
}
/** `SpecVersion` without the (potentially large) spec body. */
export type SpecVersionSummary = Omit<SpecVersion, 'spec'>;
export interface Guide {
    slug: string;
    title: string;
    markdown: string;
    published: boolean;
    /** Ascending sort key for the docs index. Ties break on title. */
    order: number;
    updatedAt: string;
}
export interface ChangelogEntry {
    id: string;
    /** `YYYY-MM-DD`. */
    date: string;
    title: string;
    markdown: string;
    published: boolean;
    updatedAt: string;
}
export type DocsAuthMode = 'public' | 'required';
/**
 * Docs-engine configuration. Absent or `enabled: false` (the default) means
 * v0.1.0 behaviour: no SQLite, no `/docs`, and `/openapi.json` served straight
 * from `config.openapi`.
 */
export interface DocsConfig {
    /** Default false. Docs are opt-in so existing consumers repin unchanged. */
    enabled?: boolean;
    /** `'required'` makes every docs route run `docsAuthCheck`. Default `'public'`. */
    authMode?: DocsAuthMode;
    /** Baseline content seeded on first boot. Default `<cwd>/content`. */
    contentDir?: string;
    /** Seed from `contentDir` when the docs tables are empty. Default true. */
    seedOnBoot?: boolean;
    /** Overrides `DATA_DIR` for this service. */
    dataDir?: string;
    /** Absolute path, a name inside the data dir, or `':memory:'`. Default `docs.sqlite`. */
    databaseFile?: string;
    /** Injection point for tests. Defaults to `better-sqlite3`. */
    databaseDriver?: SqlDatabaseFactory;
    /** Heading on `/docs`. Defaults to `${brand.displayName} developer docs`. */
    title?: string;
    /** Blurb under the heading on `/docs`. Must be static — it is part of the hash. */
    intro?: string;
}
/** Consumer-defined credential check for `authMode: 'required'`. */
export type DocsAuthCheck = (req: Request) => boolean;
export interface DocsPageLink {
    href: string;
    label: string;
}
/** What `GET /openapi.json` serves, precomputed so responses are cheap. */
export interface ServedSpec {
    body: string;
    etag: string;
    /** RFC 7231 date string. */
    lastModified: string;
    /** Second-granularity epoch, for `If-Modified-Since`. */
    lastModifiedMs: number;
    /** null when the static `config.openapi` fallback is being served. */
    version: SpecVersionSummary | null;
}
