import type { Request } from 'express';
/**
 * Conditional-GET evaluation for the two cacheable surfaces sim-core serves
 * (`/openapi.json` and the docs pages).
 *
 * The platform HEAD- and GET-probes published specs on a schedule and will
 * happily send either validator, so both paths have to be right: an
 * always-200 endpoint makes every poll look like a spec change, and an
 * always-304 endpoint hides real ones.
 */
/** RFC 7231 IMF-fixdate, e.g. `Wed, 30 Jul 2026 12:00:00 GMT`. */
export declare function httpDate(input: number | Date): string;
/** HTTP dates have one-second resolution — compare at that granularity. */
export declare function toHttpSeconds(input: number | Date): number;
export interface ConditionalTarget {
    /** Strong entity tag, quotes included. */
    etag: string;
    lastModified: number | Date;
}
/**
 * True when the client's cached copy is still good.
 *
 * Per RFC 9110 §13.1.3, `If-None-Match` wins outright when present — a client
 * that sends both an ETag and a date gets the ETag answer, never an
 * accidental 304 from a coarse timestamp.
 */
export declare function isNotModified(req: Request, target: ConditionalTarget): boolean;
