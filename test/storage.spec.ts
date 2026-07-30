import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  DEFAULT_DATA_DIR,
  DOCS_MIGRATIONS,
  SimStorage,
  resolveDataDir,
  resolveDatabaseFile,
  type Migration,
} from '../src';

describe('storage', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sim-core-storage-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('DATA_DIR resolution', () => {
    const original = process.env.DATA_DIR;

    afterEach(() => {
      if (original === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = original;
    });

    it('defaults to ./data relative to cwd', () => {
      delete process.env.DATA_DIR;
      expect(DEFAULT_DATA_DIR).toBe('./data');
      expect(resolveDataDir()).toBe(resolve(process.cwd(), 'data'));
    });

    it('honours DATA_DIR, absolute or relative', () => {
      process.env.DATA_DIR = '/srv/sim/data';
      expect(resolveDataDir()).toBe('/srv/sim/data');
      process.env.DATA_DIR = 'var/state';
      expect(resolveDataDir()).toBe(resolve(process.cwd(), 'var/state'));
    });

    it('lets an explicit override beat the env var', () => {
      process.env.DATA_DIR = '/srv/sim/data';
      expect(resolveDataDir('/tmp/elsewhere')).toBe('/tmp/elsewhere');
    });

    it('resolves database files against the data dir, passing :memory: through', () => {
      expect(resolveDatabaseFile(':memory:', dir)).toBe(':memory:');
      expect(resolveDatabaseFile('docs.sqlite', dir)).toBe(join(dir, 'docs.sqlite'));
      expect(resolveDatabaseFile('/abs/docs.sqlite', dir)).toBe('/abs/docs.sqlite');
      expect(resolveDatabaseFile(undefined, dir)).toBe(join(dir, 'docs.sqlite'));
    });
  });

  describe('migrations', () => {
    const migrations: Migration[] = [
      { id: '0001-a', sql: 'CREATE TABLE a (id TEXT PRIMARY KEY);' },
      { id: '0002-b', sql: 'CREATE TABLE b (id TEXT PRIMARY KEY);' },
    ];

    it('creates the data dir and the database file', () => {
      const nested = join(dir, 'deep', 'nested');
      const storage = new SimStorage({ dataDir: nested, migrations });
      expect(existsSync(join(nested, 'docs.sqlite'))).toBe(true);
      storage.close();
    });

    it('applies each migration exactly once and records it', () => {
      const storage = new SimStorage({ dataDir: dir, migrations });
      expect(storage.applied().map((m) => m.id)).toEqual(['0001-a', '0002-b']);

      // Re-running is a no-op: `CREATE TABLE a` would throw if it ran twice.
      expect(storage.migrate(migrations)).toEqual([]);
      storage.close();
    });

    it('applies only the new migrations when the set grows', () => {
      const first = new SimStorage({ dataDir: dir, migrations: [migrations[0] as Migration] });
      first.close();

      const second = new SimStorage({ dataDir: dir, migrations });
      expect(second.applied().map((m) => m.id)).toEqual(['0001-a', '0002-b']);
      second.close();
    });

    it('survives reopening the same file — state is durable', () => {
      const first = new SimStorage({ dataDir: dir, migrations });
      first.stmt('INSERT INTO a (id) VALUES (?)').run('kept');
      first.close();

      const second = new SimStorage({ dataDir: dir, migrations });
      expect(second.stmt('SELECT id FROM a').all()).toEqual([{ id: 'kept' }]);
      second.close();
    });

    it('rolls a failing migration back rather than half-applying it', () => {
      const storage = new SimStorage({ dataDir: dir });
      expect(() =>
        storage.migrate([
          { id: '0001-bad', sql: 'CREATE TABLE ok (id TEXT); THIS IS NOT SQL;' },
        ]),
      ).toThrow();
      expect(storage.applied()).toEqual([]);
      expect(() => storage.stmt('SELECT * FROM ok').all()).toThrow(/no such table/i);
      storage.close();
    });
  });

  describe('docs migrations', () => {
    it('enforces the single-active-spec invariant in the database itself', () => {
      const storage = new SimStorage({ file: ':memory:', migrations: DOCS_MIGRATIONS });
      const insert = storage.stmt(
        `INSERT INTO spec_versions (id, label, spec, created_at, published_at, active)
         VALUES (?, ?, '{}', '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z', 1)`,
      );
      insert.run('a', 'baseline');
      expect(() => insert.run('b', 'additive')).toThrow(/UNIQUE/i);
      storage.close();
    });

    it('accepts any number of inactive rows', () => {
      const storage = new SimStorage({ file: ':memory:', migrations: DOCS_MIGRATIONS });
      const insert = storage.stmt(
        `INSERT INTO spec_versions (id, label, spec, created_at, published_at, active)
         VALUES (?, ?, '{}', '2026-07-30T00:00:00.000Z', NULL, 0)`,
      );
      insert.run('a', 'one');
      insert.run('b', 'two');
      insert.run('c', 'three');
      expect(storage.stmt('SELECT COUNT(*) AS n FROM spec_versions').get()).toEqual({ n: 3 });
      storage.close();
    });
  });
});
