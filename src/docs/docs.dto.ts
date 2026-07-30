import { BadRequestException } from '@nestjs/common';

import type { OpenApiDocument } from '../config';

function fail(errors: Record<string, string>): never {
  throw new BadRequestException({
    error: 'validation_failed',
    message: 'Request body failed validation',
    errors,
  });
}

const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asRecord(body: unknown): Record<string, unknown> {
  return (body ?? {}) as Record<string, unknown>;
}

/**
 * Parse a spec payload. The admin SPA sends the JSON the operator typed into a
 * textarea, so this accepts either a parsed object or a raw string and reports
 * the parse error rather than 500-ing — "line 14: unexpected token" is the
 * whole value of the editor.
 */
function parseSpec(value: unknown, errors: Record<string, string>): OpenApiDocument | undefined {
  let candidate: unknown = value;

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch (error) {
      errors.spec = `is not valid JSON (${error instanceof Error ? error.message : 'parse failed'})`;
      return undefined;
    }
  }
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    errors.spec = 'must be a JSON object';
    return undefined;
  }
  const doc = candidate as Partial<OpenApiDocument>;
  if (typeof doc.openapi !== 'string' || !doc.openapi) {
    errors.spec = 'must have a string `openapi` version field';
    return undefined;
  }
  if (typeof doc.info !== 'object' || doc.info === null) {
    errors.spec = 'must have an `info` object';
    return undefined;
  }
  return candidate as OpenApiDocument;
}

export interface CreateSpecVersionBody {
  label: string;
  /** Omitted together with `fromActive` means "copy the active spec". */
  spec?: OpenApiDocument;
  fromActive?: boolean;
  publish?: boolean;
}

export function parseCreateSpecVersionBody(body: unknown): CreateSpecVersionBody {
  const errors: Record<string, string> = {};
  const source = asRecord(body);

  const label = typeof source.label === 'string' ? source.label.trim() : '';
  if (!LABEL.test(label)) {
    errors.label =
      'is required and must be 1-64 chars of letters, digits, dot, dash or underscore';
  }

  const fromActive = source.fromActive === true || source.spec === undefined;
  const spec = fromActive ? undefined : parseSpec(source.spec, errors);

  if (Object.keys(errors).length > 0) fail(errors);

  return { label, spec, fromActive, publish: source.publish === true };
}

export interface UpdateSpecVersionBody {
  label?: string;
  spec?: OpenApiDocument;
}

export function parseUpdateSpecVersionBody(body: unknown): UpdateSpecVersionBody {
  const errors: Record<string, string> = {};
  const source = asRecord(body);
  const patch: UpdateSpecVersionBody = {};

  if (source.label !== undefined) {
    const label = typeof source.label === 'string' ? source.label.trim() : '';
    if (!LABEL.test(label)) {
      errors.label = 'must be 1-64 chars of letters, digits, dot, dash or underscore';
    } else {
      patch.label = label;
    }
  }
  if (source.spec !== undefined) {
    patch.spec = parseSpec(source.spec, errors);
  }
  if (patch.label === undefined && patch.spec === undefined && !errors.label && !errors.spec) {
    errors.body = 'must contain at least one of `label` or `spec`';
  }

  if (Object.keys(errors).length > 0) fail(errors);
  return patch;
}

export interface GuideBody {
  slug: string;
  title: string;
  markdown: string;
  published: boolean;
  order?: number;
}

export function parseGuideBody(body: unknown, slugFromPath?: string): GuideBody {
  const errors: Record<string, string> = {};
  const source = asRecord(body);

  const slug = (
    slugFromPath ?? (typeof source.slug === 'string' ? source.slug : '')
  ).trim();
  if (!SLUG.test(slug)) {
    errors.slug = 'is required and must be lowercase letters, digits and dashes';
  }

  const title = typeof source.title === 'string' ? source.title.trim() : '';
  if (!title) errors.title = 'is required';

  const markdown = typeof source.markdown === 'string' ? source.markdown : '';
  if (typeof source.markdown !== 'string') errors.markdown = 'is required';

  let order: number | undefined;
  if (source.order !== undefined && source.order !== null && source.order !== '') {
    const raw = typeof source.order === 'string' ? Number(source.order) : source.order;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      errors.order = 'must be a number';
    } else {
      order = Math.floor(raw);
    }
  }

  if (Object.keys(errors).length > 0) fail(errors);
  return { slug, title, markdown, published: source.published === true, order };
}

export interface ChangelogBody {
  id?: string;
  date: string;
  title: string;
  markdown: string;
  published: boolean;
}

export function parseChangelogBody(body: unknown, idFromPath?: string): ChangelogBody {
  const errors: Record<string, string> = {};
  const source = asRecord(body);

  const date = typeof source.date === 'string' ? source.date.trim() : '';
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(date))) {
    errors.date = 'is required and must be an ISO date (YYYY-MM-DD)';
  }

  const title = typeof source.title === 'string' ? source.title.trim() : '';
  if (!title) errors.title = 'is required';

  if (typeof source.markdown !== 'string') errors.markdown = 'is required';

  const id = (idFromPath ?? (typeof source.id === 'string' ? source.id : '')).trim();
  if (id && !SLUG.test(id) && !/^[A-Za-z0-9._-]{1,64}$/.test(id)) {
    errors.id = 'must be 1-64 chars of letters, digits, dot, dash or underscore';
  }

  if (Object.keys(errors).length > 0) fail(errors);

  return {
    id: id || undefined,
    date,
    title,
    markdown: source.markdown as string,
    published: source.published === true,
  };
}

export function parsePreviewBody(body: unknown): string {
  const source = asRecord(body);
  if (typeof source.markdown !== 'string') {
    fail({ markdown: 'is required' });
  }
  return source.markdown as string;
}
