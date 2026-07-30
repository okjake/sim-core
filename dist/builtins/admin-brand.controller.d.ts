import { type SimBrand, type SimCoreConfig } from '../config';
export interface AdminBrandPayload {
    name: string;
    version: string;
    brand: SimBrand;
    /** Whether a traffic driver exists, so the SPA can hide driver controls. */
    driver: boolean;
    /** Whether the docs engine is on, so the SPA can hide the Docs tab. */
    docs: boolean;
    /** Whether the Google gate is on, so the SPA can offer a Sign out link. */
    adminAuth: boolean;
}
/**
 * Unauthenticated, display-only metadata for the admin SPA's shell (title,
 * theme colour) — needed before a control token has been entered. Contains no
 * secrets and no runtime state.
 *
 * ## Why this stays open when `adminAuth` is enabled (audited for v0.3.0)
 *
 * The payload is five values: the service name, its version, the brand block
 * (display name, colour, tagline) and two feature booleans. Nothing here is a
 * credential, a hostname, a count, or any runtime state — and the two booleans
 * are already observable without it (`/docs` answers 200 or 404; the gate
 * announces itself with a 302). `builtins.spec.ts` asserts the exact key set,
 * so adding a field to this payload fails a test rather than quietly widening
 * an unauthenticated surface: if that ever needs to carry something real, it
 * moves behind the gate at the same time.
 */
export declare class AdminBrandController {
    private readonly config;
    constructor(config: SimCoreConfig);
    brand(): AdminBrandPayload;
}
