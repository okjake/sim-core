/**
 * Locate the built admin SPA.
 *
 * The SPA is built by `pnpm build:admin` into `<pkg>/dist/public` and is
 * committed, so a `github:` install of this package already contains it.
 * Returns `null` when it is missing (e.g. running from source before a build)
 * so the module can simply skip static serving instead of crashing.
 */
export declare function resolveAdminDist(): string | null;
