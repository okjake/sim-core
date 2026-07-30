import { type SimBrand, type SimCoreConfig } from '../config';
export interface AdminBrandPayload {
    name: string;
    version: string;
    brand: SimBrand;
    /** Whether a traffic driver exists, so the SPA can hide driver controls. */
    driver: boolean;
}
/**
 * Unauthenticated, display-only metadata for the admin SPA's shell (title,
 * theme colour) — needed before a control token has been entered. Contains no
 * secrets and no runtime state.
 */
export declare class AdminBrandController {
    private readonly config;
    constructor(config: SimCoreConfig);
    brand(): AdminBrandPayload;
}
