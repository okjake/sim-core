import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { OpenApiDocument } from '../config';
import type { SimStorage } from '../storage/storage.service';
import type { Migration } from '../storage/storage.types';
import type {
  ChangelogEntry,
  Guide,
  SpecVersion,
  SpecVersionSummary,
} from './docs.types';

/**
 * Ordered and immutable. Adding a table or column means appending a new entry —
 * never editing a shipped one, because deployed sims already recorded it as
 * applied.
 */
export const DOCS_MIGRATIONS: Migration[] = [
  {
    id: '0001-docs-engine',
    sql: `
      CREATE TABLE spec_versions (
        id            TEXT PRIMARY KEY,
        label         TEXT NOT NULL UNIQUE,
        spec          TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        published_at  TEXT,
        active        INTEGER NOT NULL DEFAULT 0
      );

      -- The single-active invariant, enforced by the database rather than by
      -- application code that a future edit could forget to run.
      CREATE UNIQUE INDEX spec_versions_one_active
        ON spec_versions (active) WHERE active = 1;

      CREATE TABLE guides (
        slug        TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        markdown    TEXT NOT NULL,
        published   INTEGER NOT NULL DEFAULT 0,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE changelog_entries (
        id          TEXT PRIMARY KEY,
        date        TEXT NOT NULL,
        title       TEXT NOT NULL,
        markdown    TEXT NOT NULL,
        published   INTEGER NOT NULL DEFAULT 0,
        updated_at  TEXT NOT NULL
      );

      CREATE INDEX changelog_entries_date ON changelog_entries (date DESC);
    `,
  },
];

interface SpecRow {
  id: string;
  label: string;
  spec: string;
  created_at: string;
  published_at: string | null;
  active: number;
}

interface GuideRow {
  slug: string;
  title: string;
  markdown: string;
  published: number;
  sort_order: number;
  updated_at: string;
}

interface ChangelogRow {
  id: string;
  date: string;
  title: string;
  markdown: string;
  published: number;
  updated_at: string;
}

const SPEC_COLUMNS = 'id, label, spec, created_at, published_at, active';
const SPEC_SUMMARY_COLUMNS = 'id, label, created_at, published_at, active';

function toSummary(row: Omit<SpecRow, 'spec'>): SpecVersionSummary {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    active: row.active === 1,
  };
}

function toSpecVersion(row: SpecRow): SpecVersion {
  return { ...toSummary(row), spec: JSON.parse(row.spec) as OpenApiDocument };
}

function toGuide(row: GuideRow): Guide {
  return {
    slug: row.slug,
    title: row.title,
    markdown: row.markdown,
    published: row.published === 1,
    order: row.sort_order,
    updatedAt: row.updated_at,
  };
}

function toChangelogEntry(row: ChangelogRow): ChangelogEntry {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    markdown: row.markdown,
    published: row.published === 1,
    updatedAt: row.updated_at,
  };
}

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
export class DocsRepository {
  constructor(private readonly storage: SimStorage) {}

  // ------------------------------------------------------------ spec versions

  listSpecVersions(): SpecVersionSummary[] {
    const rows = this.storage
      .stmt(
        `SELECT ${SPEC_SUMMARY_COLUMNS} FROM spec_versions
         ORDER BY COALESCE(published_at, created_at) DESC, label ASC`,
      )
      .all() as Array<Omit<SpecRow, 'spec'>>;
    return rows.map(toSummary);
  }

  getSpecVersion(id: string): SpecVersion | null {
    const row = this.storage
      .stmt(`SELECT ${SPEC_COLUMNS} FROM spec_versions WHERE id = ?`)
      .get(id) as SpecRow | undefined;
    return row ? toSpecVersion(row) : null;
  }

  getSpecVersionByLabel(label: string): SpecVersion | null {
    const row = this.storage
      .stmt(`SELECT ${SPEC_COLUMNS} FROM spec_versions WHERE label = ?`)
      .get(label) as SpecRow | undefined;
    return row ? toSpecVersion(row) : null;
  }

  /** The one version `/openapi.json` serves, or null before anything is published. */
  getActiveSpecVersion(): SpecVersion | null {
    const row = this.storage
      .stmt(`SELECT ${SPEC_COLUMNS} FROM spec_versions WHERE active = 1`)
      .get() as SpecRow | undefined;
    return row ? toSpecVersion(row) : null;
  }

  createSpecVersion(input: SpecVersionInput, now = new Date()): SpecVersion {
    const existing = this.getSpecVersionByLabel(input.label);
    if (existing) {
      throw new ConflictException({
        error: 'spec_label_taken',
        message: `A spec version labelled "${input.label}" already exists`,
      });
    }

    const id = randomUUID();
    this.storage
      .stmt(
        `INSERT INTO spec_versions (id, label, spec, created_at, published_at, active)
         VALUES (?, ?, ?, ?, NULL, 0)`,
      )
      .run(id, input.label, JSON.stringify(input.spec), now.toISOString());

    if (input.publish) {
      return this.publishSpecVersion(id, now);
    }
    return this.getSpecVersion(id) as SpecVersion;
  }

  /** Drafts are freely editable; published versions are immutable history. */
  updateSpecVersion(
    id: string,
    patch: { label?: string; spec?: OpenApiDocument },
  ): SpecVersion {
    const current = this.getSpecVersion(id);
    if (!current) {
      throw new NotFoundException({
        error: 'unknown_spec_version',
        message: `No spec version with id "${id}"`,
      });
    }
    if (current.publishedAt !== null) {
      throw new ConflictException({
        error: 'spec_version_published',
        message:
          'A published spec version is immutable — create a new draft instead. ' +
          'Consumers of the platform diff pipeline rely on published specs not changing under them.',
      });
    }
    if (patch.label !== undefined && patch.label !== current.label) {
      const clash = this.getSpecVersionByLabel(patch.label);
      if (clash) {
        throw new ConflictException({
          error: 'spec_label_taken',
          message: `A spec version labelled "${patch.label}" already exists`,
        });
      }
    }

    this.storage
      .stmt('UPDATE spec_versions SET label = ?, spec = ? WHERE id = ?')
      .run(
        patch.label ?? current.label,
        JSON.stringify(patch.spec ?? current.spec),
        id,
      );

    return this.getSpecVersion(id) as SpecVersion;
  }

  /**
   * Make `id` the active published version.
   *
   * `published_at` is stamped on every publish, including a republish of an
   * older version: what `/openapi.json` serves has changed as of now, and
   * `Last-Modified` must move or conditional-GET clients never re-fetch.
   */
  publishSpecVersion(id: string, now = new Date()): SpecVersion {
    const current = this.getSpecVersion(id);
    if (!current) {
      throw new NotFoundException({
        error: 'unknown_spec_version',
        message: `No spec version with id "${id}"`,
      });
    }

    const run = this.storage.transaction(() => {
      // Deactivate first — the partial unique index would reject two actives.
      this.storage.stmt('UPDATE spec_versions SET active = 0 WHERE active = 1').run();
      this.storage
        .stmt('UPDATE spec_versions SET active = 1, published_at = ? WHERE id = ?')
        .run(now.toISOString(), id);
    });
    run();

    return this.getSpecVersion(id) as SpecVersion;
  }

  deleteSpecVersion(id: string): void {
    const current = this.getSpecVersion(id);
    if (!current) {
      throw new NotFoundException({
        error: 'unknown_spec_version',
        message: `No spec version with id "${id}"`,
      });
    }
    if (current.active) {
      throw new ConflictException({
        error: 'spec_version_active',
        message: 'Publish another version before deleting the active one',
      });
    }
    this.storage.stmt('DELETE FROM spec_versions WHERE id = ?').run(id);
  }

  // ------------------------------------------------------------------- guides

  listGuides(onlyPublished = false): Guide[] {
    const rows = this.storage
      .stmt(
        `SELECT slug, title, markdown, published, sort_order, updated_at FROM guides
         ${onlyPublished ? 'WHERE published = 1' : ''}
         ORDER BY sort_order ASC, title ASC, slug ASC`,
      )
      .all() as GuideRow[];
    return rows.map(toGuide);
  }

  getGuide(slug: string): Guide | null {
    const row = this.storage
      .stmt(
        'SELECT slug, title, markdown, published, sort_order, updated_at FROM guides WHERE slug = ?',
      )
      .get(slug) as GuideRow | undefined;
    return row ? toGuide(row) : null;
  }

  /** Insert or replace by slug. */
  upsertGuide(input: GuideInput, now = new Date()): Guide {
    const existing = this.getGuide(input.slug);
    this.storage
      .stmt(
        `INSERT INTO guides (slug, title, markdown, published, sort_order, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           title = excluded.title,
           markdown = excluded.markdown,
           published = excluded.published,
           sort_order = excluded.sort_order,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.slug,
        input.title,
        input.markdown,
        (input.published ?? existing?.published ?? false) ? 1 : 0,
        input.order ?? existing?.order ?? 0,
        now.toISOString(),
      );
    return this.getGuide(input.slug) as Guide;
  }

  deleteGuide(slug: string): void {
    const result = this.storage.stmt('DELETE FROM guides WHERE slug = ?').run(slug);
    if (result.changes === 0) {
      throw new NotFoundException({
        error: 'unknown_guide',
        message: `No guide with slug "${slug}"`,
      });
    }
  }

  // ---------------------------------------------------------------- changelog

  listChangelog(onlyPublished = false): ChangelogEntry[] {
    const rows = this.storage
      .stmt(
        `SELECT id, date, title, markdown, published, updated_at FROM changelog_entries
         ${onlyPublished ? 'WHERE published = 1' : ''}
         ORDER BY date DESC, title ASC, id ASC`,
      )
      .all() as ChangelogRow[];
    return rows.map(toChangelogEntry);
  }

  getChangelogEntry(id: string): ChangelogEntry | null {
    const row = this.storage
      .stmt(
        'SELECT id, date, title, markdown, published, updated_at FROM changelog_entries WHERE id = ?',
      )
      .get(id) as ChangelogRow | undefined;
    return row ? toChangelogEntry(row) : null;
  }

  upsertChangelogEntry(input: ChangelogEntryInput, now = new Date()): ChangelogEntry {
    const id = input.id ?? randomUUID();
    const existing = this.getChangelogEntry(id);
    this.storage
      .stmt(
        `INSERT INTO changelog_entries (id, date, title, markdown, published, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           date = excluded.date,
           title = excluded.title,
           markdown = excluded.markdown,
           published = excluded.published,
           updated_at = excluded.updated_at`,
      )
      .run(
        id,
        input.date,
        input.title,
        input.markdown,
        (input.published ?? existing?.published ?? false) ? 1 : 0,
        now.toISOString(),
      );
    return this.getChangelogEntry(id) as ChangelogEntry;
  }

  deleteChangelogEntry(id: string): void {
    const result = this.storage
      .stmt('DELETE FROM changelog_entries WHERE id = ?')
      .run(id);
    if (result.changes === 0) {
      throw new NotFoundException({
        error: 'unknown_changelog_entry',
        message: `No changelog entry with id "${id}"`,
      });
    }
  }

  // -------------------------------------------------------------------- bulk

  isEmpty(): boolean {
    const counts = this.counts();
    return counts.specVersions === 0 && counts.guides === 0 && counts.changelog === 0;
  }

  counts(): { specVersions: number; guides: number; changelog: number } {
    const one = (sql: string): number =>
      Number((this.storage.stmt(sql).get() as { n: number }).n);
    return {
      specVersions: one('SELECT COUNT(*) AS n FROM spec_versions'),
      guides: one('SELECT COUNT(*) AS n FROM guides'),
      changelog: one('SELECT COUNT(*) AS n FROM changelog_entries'),
    };
  }

  /** Wipes every docs table. Only ever called by `POST /__control/reset-docs`. */
  wipe(): void {
    const run = this.storage.transaction(() => {
      this.storage.stmt('DELETE FROM spec_versions').run();
      this.storage.stmt('DELETE FROM guides').run();
      this.storage.stmt('DELETE FROM changelog_entries').run();
    });
    run();
  }
}
