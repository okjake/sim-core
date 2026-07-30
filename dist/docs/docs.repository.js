"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocsRepository = exports.DOCS_MIGRATIONS = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
/**
 * Ordered and immutable. Adding a table or column means appending a new entry —
 * never editing a shipped one, because deployed sims already recorded it as
 * applied.
 */
exports.DOCS_MIGRATIONS = [
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
const SPEC_COLUMNS = 'id, label, spec, created_at, published_at, active';
const SPEC_SUMMARY_COLUMNS = 'id, label, created_at, published_at, active';
function toSummary(row) {
    return {
        id: row.id,
        label: row.label,
        createdAt: row.created_at,
        publishedAt: row.published_at,
        active: row.active === 1,
    };
}
function toSpecVersion(row) {
    return { ...toSummary(row), spec: JSON.parse(row.spec) };
}
function toGuide(row) {
    return {
        slug: row.slug,
        title: row.title,
        markdown: row.markdown,
        published: row.published === 1,
        order: row.sort_order,
        updatedAt: row.updated_at,
    };
}
function toChangelogEntry(row) {
    return {
        id: row.id,
        date: row.date,
        title: row.title,
        markdown: row.markdown,
        published: row.published === 1,
        updatedAt: row.updated_at,
    };
}
/** All docs SQL, in one place. No HTTP concepts, no rendering. */
class DocsRepository {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    // ------------------------------------------------------------ spec versions
    listSpecVersions() {
        const rows = this.storage
            .stmt(`SELECT ${SPEC_SUMMARY_COLUMNS} FROM spec_versions
         ORDER BY COALESCE(published_at, created_at) DESC, label ASC`)
            .all();
        return rows.map(toSummary);
    }
    getSpecVersion(id) {
        const row = this.storage
            .stmt(`SELECT ${SPEC_COLUMNS} FROM spec_versions WHERE id = ?`)
            .get(id);
        return row ? toSpecVersion(row) : null;
    }
    getSpecVersionByLabel(label) {
        const row = this.storage
            .stmt(`SELECT ${SPEC_COLUMNS} FROM spec_versions WHERE label = ?`)
            .get(label);
        return row ? toSpecVersion(row) : null;
    }
    /** The one version `/openapi.json` serves, or null before anything is published. */
    getActiveSpecVersion() {
        const row = this.storage
            .stmt(`SELECT ${SPEC_COLUMNS} FROM spec_versions WHERE active = 1`)
            .get();
        return row ? toSpecVersion(row) : null;
    }
    createSpecVersion(input, now = new Date()) {
        const existing = this.getSpecVersionByLabel(input.label);
        if (existing) {
            throw new common_1.ConflictException({
                error: 'spec_label_taken',
                message: `A spec version labelled "${input.label}" already exists`,
            });
        }
        const id = (0, node_crypto_1.randomUUID)();
        this.storage
            .stmt(`INSERT INTO spec_versions (id, label, spec, created_at, published_at, active)
         VALUES (?, ?, ?, ?, NULL, 0)`)
            .run(id, input.label, JSON.stringify(input.spec), now.toISOString());
        if (input.publish) {
            return this.publishSpecVersion(id, now);
        }
        return this.getSpecVersion(id);
    }
    /** Drafts are freely editable; published versions are immutable history. */
    updateSpecVersion(id, patch) {
        const current = this.getSpecVersion(id);
        if (!current) {
            throw new common_1.NotFoundException({
                error: 'unknown_spec_version',
                message: `No spec version with id "${id}"`,
            });
        }
        if (current.publishedAt !== null) {
            throw new common_1.ConflictException({
                error: 'spec_version_published',
                message: 'A published spec version is immutable — create a new draft instead. ' +
                    'Consumers of the platform diff pipeline rely on published specs not changing under them.',
            });
        }
        if (patch.label !== undefined && patch.label !== current.label) {
            const clash = this.getSpecVersionByLabel(patch.label);
            if (clash) {
                throw new common_1.ConflictException({
                    error: 'spec_label_taken',
                    message: `A spec version labelled "${patch.label}" already exists`,
                });
            }
        }
        this.storage
            .stmt('UPDATE spec_versions SET label = ?, spec = ? WHERE id = ?')
            .run(patch.label ?? current.label, JSON.stringify(patch.spec ?? current.spec), id);
        return this.getSpecVersion(id);
    }
    /**
     * Make `id` the active published version.
     *
     * `published_at` is stamped on every publish, including a republish of an
     * older version: what `/openapi.json` serves has changed as of now, and
     * `Last-Modified` must move or conditional-GET clients never re-fetch.
     */
    publishSpecVersion(id, now = new Date()) {
        const current = this.getSpecVersion(id);
        if (!current) {
            throw new common_1.NotFoundException({
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
        return this.getSpecVersion(id);
    }
    deleteSpecVersion(id) {
        const current = this.getSpecVersion(id);
        if (!current) {
            throw new common_1.NotFoundException({
                error: 'unknown_spec_version',
                message: `No spec version with id "${id}"`,
            });
        }
        if (current.active) {
            throw new common_1.ConflictException({
                error: 'spec_version_active',
                message: 'Publish another version before deleting the active one',
            });
        }
        this.storage.stmt('DELETE FROM spec_versions WHERE id = ?').run(id);
    }
    // ------------------------------------------------------------------- guides
    listGuides(onlyPublished = false) {
        const rows = this.storage
            .stmt(`SELECT slug, title, markdown, published, sort_order, updated_at FROM guides
         ${onlyPublished ? 'WHERE published = 1' : ''}
         ORDER BY sort_order ASC, title ASC, slug ASC`)
            .all();
        return rows.map(toGuide);
    }
    getGuide(slug) {
        const row = this.storage
            .stmt('SELECT slug, title, markdown, published, sort_order, updated_at FROM guides WHERE slug = ?')
            .get(slug);
        return row ? toGuide(row) : null;
    }
    /** Insert or replace by slug. */
    upsertGuide(input, now = new Date()) {
        const existing = this.getGuide(input.slug);
        this.storage
            .stmt(`INSERT INTO guides (slug, title, markdown, published, sort_order, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           title = excluded.title,
           markdown = excluded.markdown,
           published = excluded.published,
           sort_order = excluded.sort_order,
           updated_at = excluded.updated_at`)
            .run(input.slug, input.title, input.markdown, (input.published ?? existing?.published ?? false) ? 1 : 0, input.order ?? existing?.order ?? 0, now.toISOString());
        return this.getGuide(input.slug);
    }
    deleteGuide(slug) {
        const result = this.storage.stmt('DELETE FROM guides WHERE slug = ?').run(slug);
        if (result.changes === 0) {
            throw new common_1.NotFoundException({
                error: 'unknown_guide',
                message: `No guide with slug "${slug}"`,
            });
        }
    }
    // ---------------------------------------------------------------- changelog
    listChangelog(onlyPublished = false) {
        const rows = this.storage
            .stmt(`SELECT id, date, title, markdown, published, updated_at FROM changelog_entries
         ${onlyPublished ? 'WHERE published = 1' : ''}
         ORDER BY date DESC, title ASC, id ASC`)
            .all();
        return rows.map(toChangelogEntry);
    }
    getChangelogEntry(id) {
        const row = this.storage
            .stmt('SELECT id, date, title, markdown, published, updated_at FROM changelog_entries WHERE id = ?')
            .get(id);
        return row ? toChangelogEntry(row) : null;
    }
    upsertChangelogEntry(input, now = new Date()) {
        const id = input.id ?? (0, node_crypto_1.randomUUID)();
        const existing = this.getChangelogEntry(id);
        this.storage
            .stmt(`INSERT INTO changelog_entries (id, date, title, markdown, published, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           date = excluded.date,
           title = excluded.title,
           markdown = excluded.markdown,
           published = excluded.published,
           updated_at = excluded.updated_at`)
            .run(id, input.date, input.title, input.markdown, (input.published ?? existing?.published ?? false) ? 1 : 0, now.toISOString());
        return this.getChangelogEntry(id);
    }
    deleteChangelogEntry(id) {
        const result = this.storage
            .stmt('DELETE FROM changelog_entries WHERE id = ?')
            .run(id);
        if (result.changes === 0) {
            throw new common_1.NotFoundException({
                error: 'unknown_changelog_entry',
                message: `No changelog entry with id "${id}"`,
            });
        }
    }
    // -------------------------------------------------------------------- bulk
    isEmpty() {
        const counts = this.counts();
        return counts.specVersions === 0 && counts.guides === 0 && counts.changelog === 0;
    }
    counts() {
        const one = (sql) => Number(this.storage.stmt(sql).get().n);
        return {
            specVersions: one('SELECT COUNT(*) AS n FROM spec_versions'),
            guides: one('SELECT COUNT(*) AS n FROM guides'),
            changelog: one('SELECT COUNT(*) AS n FROM changelog_entries'),
        };
    }
    /** Wipes every docs table. Only ever called by `POST /__control/reset-docs`. */
    wipe() {
        const run = this.storage.transaction(() => {
            this.storage.stmt('DELETE FROM spec_versions').run();
            this.storage.stmt('DELETE FROM guides').run();
            this.storage.stmt('DELETE FROM changelog_entries').run();
        });
        run();
    }
}
exports.DocsRepository = DocsRepository;
