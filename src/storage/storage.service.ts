import { Logger } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import type {
  AppliedMigration,
  Migration,
  SqlDatabase,
  SqlDatabaseFactory,
  SqlStatement,
  StorageOptions,
} from './storage.types';

/** Where persistent state lives. `DATA_DIR`, default `./data`, gitignored. */
export const DEFAULT_DATA_DIR = './data';

/** Absolute data directory: explicit override › `DATA_DIR` › `./data`. */
export function resolveDataDir(override?: string): string {
  const raw = override ?? process.env.DATA_DIR ?? DEFAULT_DATA_DIR;
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

/**
 * Resolve a database file path. `':memory:'` is passed through untouched;
 * absolute paths win; anything else is relative to the data dir.
 */
export function resolveDatabaseFile(file = 'docs.sqlite', dataDir?: string): string {
  if (file === ':memory:') return file;
  if (isAbsolute(file)) return file;
  return resolve(resolveDataDir(dataDir), file);
}

/** Lazily loaded so a docs-disabled service never touches the native module. */
function loadDefaultDriver(): SqlDatabaseFactory {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod: unknown = require('better-sqlite3');
  const ctor = ((mod as { default?: unknown }).default ?? mod) as new (
    filename: string,
  ) => SqlDatabase;
  return (filename: string) => new ctor(filename);
}

const MIGRATION_TABLE = `
CREATE TABLE IF NOT EXISTS sim_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL
);`;

/**
 * A very small SQLite wrapper: open (creating the data dir), run pending
 * migrations, hand out prepared statements, close.
 *
 * Deliberately not a Nest `@Injectable()` — the docs engine owns its instance
 * and nothing else in sim-core persists anything. Chaos, driver and request-tail
 * state stay in memory by design.
 */
export class SimStorage {
  private readonly logger = new Logger('SimStorage');
  private readonly statements = new Map<string, SqlStatement>();

  readonly file: string;
  readonly db: SqlDatabase;

  constructor(options: StorageOptions = {}) {
    this.file = resolveDatabaseFile(options.file, options.dataDir);

    if (this.file !== ':memory:') {
      mkdirSync(dirname(this.file), { recursive: true });
    }

    const driver = options.driver ?? loadDefaultDriver();
    this.db = driver(this.file);

    // WAL is a pure win on a Render persistent disk; harmless in memory.
    try {
      this.db.pragma('journal_mode = WAL');
    } catch {
      /* :memory: and some drivers reject it — not worth failing a boot over. */
    }
    this.db.exec(MIGRATION_TABLE);

    if (options.migrations?.length) {
      this.migrate(options.migrations);
    }
  }

  /** Applies every migration not yet recorded, in array order, transactionally. */
  migrate(migrations: Migration[]): AppliedMigration[] {
    const done = new Set(this.applied().map((m) => m.id));
    const newlyApplied: AppliedMigration[] = [];

    for (const migration of migrations) {
      if (done.has(migration.id)) continue;
      const appliedAt = new Date().toISOString();
      const run = this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.db
          .prepare('INSERT INTO sim_migrations (id, applied_at) VALUES (?, ?)')
          .run(migration.id, appliedAt);
      });
      run();
      newlyApplied.push({ id: migration.id, appliedAt });
      this.logger.log(`applied migration ${migration.id}`);
    }

    return newlyApplied;
  }

  applied(): AppliedMigration[] {
    const rows = this.db
      .prepare('SELECT id, applied_at FROM sim_migrations ORDER BY id')
      .all() as Array<{ id: string; applied_at: string }>;
    return rows.map((row) => ({ id: row.id, appliedAt: row.applied_at }));
  }

  /** Prepared-statement cache — statements are reused for the process lifetime. */
  stmt(sql: string): SqlStatement {
    const cached = this.statements.get(sql);
    if (cached) return cached;
    const prepared = this.db.prepare(sql);
    this.statements.set(sql, prepared);
    return prepared;
  }

  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return this.db.transaction(fn);
  }

  close(): void {
    this.statements.clear();
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }
}
