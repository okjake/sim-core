"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimStorage = exports.DEFAULT_DATA_DIR = void 0;
exports.resolveDataDir = resolveDataDir;
exports.resolveDatabaseFile = resolveDatabaseFile;
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/** Where persistent state lives. `DATA_DIR`, default `./data`, gitignored. */
exports.DEFAULT_DATA_DIR = './data';
/** Absolute data directory: explicit override › `DATA_DIR` › `./data`. */
function resolveDataDir(override) {
    const raw = override ?? process.env.DATA_DIR ?? exports.DEFAULT_DATA_DIR;
    return (0, node_path_1.isAbsolute)(raw) ? raw : (0, node_path_1.resolve)(process.cwd(), raw);
}
/**
 * Resolve a database file path. `':memory:'` is passed through untouched;
 * absolute paths win; anything else is relative to the data dir.
 */
function resolveDatabaseFile(file = 'docs.sqlite', dataDir) {
    if (file === ':memory:')
        return file;
    if ((0, node_path_1.isAbsolute)(file))
        return file;
    return (0, node_path_1.resolve)(resolveDataDir(dataDir), file);
}
/** Lazily loaded so a docs-disabled service never touches the native module. */
function loadDefaultDriver() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('better-sqlite3');
    const ctor = (mod.default ?? mod);
    return (filename) => new ctor(filename);
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
class SimStorage {
    logger = new common_1.Logger('SimStorage');
    statements = new Map();
    file;
    db;
    constructor(options = {}) {
        this.file = resolveDatabaseFile(options.file, options.dataDir);
        if (this.file !== ':memory:') {
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(this.file), { recursive: true });
        }
        const driver = options.driver ?? loadDefaultDriver();
        this.db = driver(this.file);
        // WAL is a pure win on a Render persistent disk; harmless in memory.
        try {
            this.db.pragma('journal_mode = WAL');
        }
        catch {
            /* :memory: and some drivers reject it — not worth failing a boot over. */
        }
        this.db.exec(MIGRATION_TABLE);
        if (options.migrations?.length) {
            this.migrate(options.migrations);
        }
    }
    /** Applies every migration not yet recorded, in array order, transactionally. */
    migrate(migrations) {
        const done = new Set(this.applied().map((m) => m.id));
        const newlyApplied = [];
        for (const migration of migrations) {
            if (done.has(migration.id))
                continue;
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
    applied() {
        const rows = this.db
            .prepare('SELECT id, applied_at FROM sim_migrations ORDER BY id')
            .all();
        return rows.map((row) => ({ id: row.id, appliedAt: row.applied_at }));
    }
    /** Prepared-statement cache — statements are reused for the process lifetime. */
    stmt(sql) {
        const cached = this.statements.get(sql);
        if (cached)
            return cached;
        const prepared = this.db.prepare(sql);
        this.statements.set(sql, prepared);
        return prepared;
    }
    transaction(fn) {
        return this.db.transaction(fn);
    }
    close() {
        this.statements.clear();
        try {
            this.db.close();
        }
        catch {
            /* already closed */
        }
    }
}
exports.SimStorage = SimStorage;
