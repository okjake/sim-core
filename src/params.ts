/**
 * A deliberately tiny "zod-ish" schema layer.
 *
 * sim-core does not depend on zod — a scenario's `params` only has to satisfy
 * {@link ParamSchema}, so a real zod schema (which has `.parse`) is accepted
 * too. Schemas built with the {@link p} helpers additionally expose
 * `describe()`, which is what `GET /__control/scenarios` publishes so the admin
 * SPA can render a form.
 */

export interface ParamFieldDescription {
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object';
  required: boolean;
  description?: string;
  default?: unknown;
  min?: number;
  max?: number;
  values?: readonly string[];
  fields?: Record<string, ParamFieldDescription>;
}

export interface ParamSchema<T = unknown> {
  /** Throws {@link ParamValidationError} when the input does not conform. */
  parse(input: unknown): T;
  /** Optional machine-readable shape, surfaced by GET /__control/scenarios. */
  describe?(): ParamFieldDescription;
}

export class ParamValidationError extends Error {
  constructor(
    message: string,
    readonly path: string[] = [],
  ) {
    super(message);
    this.name = 'ParamValidationError';
  }
}

export type Infer<S> = S extends ParamSchema<infer T> ? T : never;

interface Builder<T> extends ParamSchema<T> {
  describe(): ParamFieldDescription;
  optional(): Builder<T | undefined>;
  default(value: T): Builder<T>;
  describedAs(text: string): Builder<T>;
}

function makeBuilder<T>(
  base: ParamFieldDescription,
  check: (input: unknown, path: string[]) => T,
): Builder<T> {
  const meta: ParamFieldDescription = { ...base };

  const builder: Builder<T> = {
    parse(input: unknown): T {
      if (input === undefined || input === null) {
        if (meta.default !== undefined) {
          return meta.default as T;
        }
        if (!meta.required) {
          return undefined as T;
        }
        throw new ParamValidationError('is required');
      }
      return check(input, []);
    },
    describe: () => ({ ...meta }),
    optional: () => makeBuilder<T | undefined>({ ...meta, required: false }, check),
    default: (value: T) =>
      makeBuilder<T>({ ...meta, required: false, default: value }, check),
    describedAs: (text: string) =>
      makeBuilder<T>({ ...meta, description: text }, check),
  };

  return builder;
}

function numberSchema(opts: { min?: number; max?: number } = {}): Builder<number> {
  return makeBuilder<number>(
    { type: 'number', required: true, min: opts.min, max: opts.max },
    (input) => {
      const value = typeof input === 'string' ? Number(input) : input;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ParamValidationError('must be a finite number');
      }
      if (opts.min !== undefined && value < opts.min) {
        throw new ParamValidationError(`must be >= ${opts.min}`);
      }
      if (opts.max !== undefined && value > opts.max) {
        throw new ParamValidationError(`must be <= ${opts.max}`);
      }
      return value;
    },
  );
}

function stringSchema(): Builder<string> {
  return makeBuilder<string>({ type: 'string', required: true }, (input) => {
    if (typeof input !== 'string') {
      throw new ParamValidationError('must be a string');
    }
    return input;
  });
}

function booleanSchema(): Builder<boolean> {
  return makeBuilder<boolean>({ type: 'boolean', required: true }, (input) => {
    if (typeof input === 'boolean') return input;
    if (input === 'true') return true;
    if (input === 'false') return false;
    throw new ParamValidationError('must be a boolean');
  });
}

function enumSchema<const V extends readonly string[]>(values: V): Builder<V[number]> {
  return makeBuilder<V[number]>(
    { type: 'enum', required: true, values },
    (input) => {
      if (typeof input !== 'string' || !values.includes(input)) {
        throw new ParamValidationError(`must be one of: ${values.join(', ')}`);
      }
      return input as V[number];
    },
  );
}

type ShapeOf<S extends Record<string, ParamSchema<any>>> = {
  [K in keyof S]: S[K] extends ParamSchema<infer T> ? T : never;
};

function objectSchema<S extends Record<string, ParamSchema<any>>>(
  shape: S,
): Builder<ShapeOf<S>> {
  const fields: Record<string, ParamFieldDescription> = {};
  for (const [key, schema] of Object.entries(shape)) {
    fields[key] = schema.describe?.() ?? { type: 'string', required: true };
  }

  return makeBuilder<ShapeOf<S>>(
    { type: 'object', required: true, fields },
    (input) => {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new ParamValidationError('must be an object');
      }
      const source = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(shape)) {
        try {
          const value = schema.parse(source[key]);
          if (value !== undefined) {
            out[key] = value;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'is invalid';
          throw new ParamValidationError(`${key} ${message}`, [key]);
        }
      }
      return out as ShapeOf<S>;
    },
  );
}

/** Schema builders. `p.object({ ms: p.number({ min: 0 }).default(250) })`. */
export const p = {
  number: numberSchema,
  string: stringSchema,
  boolean: booleanSchema,
  enum: enumSchema,
  object: objectSchema,
};

/** Safe `describe()` access for arbitrary (possibly zod) schemas. */
export function describeSchema(
  schema: ParamSchema<any> | undefined,
): ParamFieldDescription | null {
  if (!schema || typeof schema.describe !== 'function') {
    return null;
  }
  try {
    // zod also has a `.describe()`, but it takes a string and returns a schema.
    // Only accept results that look like a ParamFieldDescription.
    const described: unknown = schema.describe();
    const kinds = ['string', 'number', 'boolean', 'enum', 'object'];
    if (
      described &&
      typeof described === 'object' &&
      kinds.includes((described as ParamFieldDescription).type)
    ) {
      return described as ParamFieldDescription;
    }
    return null;
  } catch {
    return null;
  }
}
