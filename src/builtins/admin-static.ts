import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Locate the built admin SPA.
 *
 * The SPA is built by `pnpm build:admin` into `<pkg>/dist/public` and is
 * committed, so a `github:` install of this package already contains it.
 * Returns `null` when it is missing (e.g. running from source before a build)
 * so the module can simply skip static serving instead of crashing.
 */
export function resolveAdminDist(): string | null {
  const candidates = [
    // compiled: <pkg>/dist/builtins/admin-static.js -> <pkg>/dist/public
    resolve(__dirname, '..', 'public'),
    // from source: <pkg>/src/builtins/admin-static.ts -> <pkg>/dist/public
    resolve(__dirname, '..', '..', 'dist', 'public'),
    resolve(process.cwd(), 'dist', 'public'),
    // Installed as a dependency. The scoped name is the current one; the
    // unscoped path stays as a fallback for anything still on v0.1.0's layout.
    resolve(process.cwd(), 'node_modules', '@okjake', 'sim-core', 'dist', 'public'),
    resolve(process.cwd(), 'node_modules', 'sim-core', 'dist', 'public'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
}
