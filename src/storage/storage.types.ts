/**
 * The slice of `better-sqlite3` sim-core actually uses.
 *
 * Typing against a structural interface (rather than importing the class) keeps
 * `better-sqlite3` out of the module graph for services that never enable the
 * docs engine, and lets tests substitute a driver without a native build.
 */

export interface SqlStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  exec(sql: string): unknown;
  pragma(source: string): unknown;
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
  close(): void;
}

/** `new Database(filename)` — the shape of the `better-sqlite3` default export. */
export type SqlDatabaseFactory = (filename: string) => SqlDatabase;

export interface Migration {
  /** Ordered, immutable identifier. Never renumber a shipped migration. */
  id: string;
  /** Executed inside a transaction with `exec()`. */
  sql: string;
}

export interface StorageOptions {
  /**
   * Absolute path, a filename relative to the data dir, or `':memory:'`.
   * Default `docs.sqlite`.
   */
  file?: string;
  /** Overrides `DATA_DIR`. */
  dataDir?: string;
  /** Injection point for tests / alternative drivers. */
  driver?: SqlDatabaseFactory;
  /** Applied on open. Default `DOCS_MIGRATIONS` when created by the docs engine. */
  migrations?: Migration[];
}

export interface AppliedMigration {
  id: string;
  appliedAt: string;
}
