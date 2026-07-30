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
export function httpDate(input: number | Date): string {
  return new Date(input).toUTCString();
}

/** HTTP dates have one-second resolution — compare at that granularity. */
export function toHttpSeconds(input: number | Date): number {
  return Math.floor(new Date(input).getTime() / 1000);
}

function etagMatches(header: string, etag: string): boolean {
  if (header.trim() === '*') return true;
  const normalise = (tag: string): string => tag.trim().replace(/^W\//, '');
  const target = normalise(etag);
  return header.split(',').some((tag) => normalise(tag) === target);
}

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
export function isNotModified(req: Request, target: ConditionalTarget): boolean {
  const ifNoneMatch = req.headers['if-none-match'];
  if (typeof ifNoneMatch === 'string' && ifNoneMatch.length > 0) {
    return etagMatches(ifNoneMatch, target.etag);
  }

  const ifModifiedSince = req.headers['if-modified-since'];
  if (typeof ifModifiedSince === 'string' && ifModifiedSince.length > 0) {
    const since = Date.parse(ifModifiedSince);
    if (Number.isNaN(since)) return false;
    return toHttpSeconds(target.lastModified) <= toHttpSeconds(since);
  }

  return false;
}
