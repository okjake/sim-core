import type { AppliedMigration, Migration, SqlDatabase, SqlStatement, StorageOptions } from './storage.types';
/** Where persistent state lives. `DATA_DIR`, default `./data`, gitignored. */
export declare const DEFAULT_DATA_DIR = "./data";
/** Absolute data directory: explicit override › `DATA_DIR` › `./data`. */
export declare function resolveDataDir(override?: string): string;
/**
 * Resolve a database file path. `':memory:'` is passed through untouched;
 * absolute paths win; anything else is relative to the data dir.
 */
export declare function resolveDatabaseFile(file?: string, dataDir?: string): string;
/**
 * A very small SQLite wrapper: open (creating the data dir), run pending
 * migrations, hand out prepared statements, close.
 *
 * Deliberately not a Nest `@Injectable()` — the docs engine owns its instance
 * and nothing else in sim-core persists anything. Chaos, driver and request-tail
 * state stay in memory by design.
 */
export declare class SimStorage {
    private readonly logger;
    private readonly statements;
    readonly file: string;
    readonly db: SqlDatabase;
    constructor(options?: StorageOptions);
    /** Applies every migration not yet recorded, in array order, transactionally. */
    migrate(migrations: Migration[]): AppliedMigration[];
    applied(): AppliedMigration[];
    /** Prepared-statement cache — statements are reused for the process lifetime. */
    stmt(sql: string): SqlStatement;
    transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
    close(): void;
}
