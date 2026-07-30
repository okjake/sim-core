"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAdminDist = resolveAdminDist;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * Locate the built admin SPA.
 *
 * The SPA is built by `pnpm build:admin` into `<pkg>/dist/public` and is
 * committed, so a `github:` install of this package already contains it.
 * Returns `null` when it is missing (e.g. running from source before a build)
 * so the module can simply skip static serving instead of crashing.
 */
function resolveAdminDist() {
    const candidates = [
        // compiled: <pkg>/dist/builtins/admin-static.js -> <pkg>/dist/public
        (0, node_path_1.resolve)(__dirname, '..', 'public'),
        // from source: <pkg>/src/builtins/admin-static.ts -> <pkg>/dist/public
        (0, node_path_1.resolve)(__dirname, '..', '..', 'dist', 'public'),
        (0, node_path_1.resolve)(process.cwd(), 'dist', 'public'),
        (0, node_path_1.resolve)(process.cwd(), 'node_modules', 'sim-core', 'dist', 'public'),
    ];
    for (const candidate of candidates) {
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(candidate, 'index.html'))) {
            return candidate;
        }
    }
    return null;
}
