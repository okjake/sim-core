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
export declare class ParamValidationError extends Error {
    readonly path: string[];
    constructor(message: string, path?: string[]);
}
export type Infer<S> = S extends ParamSchema<infer T> ? T : never;
interface Builder<T> extends ParamSchema<T> {
    describe(): ParamFieldDescription;
    optional(): Builder<T | undefined>;
    default(value: T): Builder<T>;
    describedAs(text: string): Builder<T>;
}
declare function numberSchema(opts?: {
    min?: number;
    max?: number;
}): Builder<number>;
declare function stringSchema(): Builder<string>;
declare function booleanSchema(): Builder<boolean>;
declare function enumSchema<const V extends readonly string[]>(values: V): Builder<V[number]>;
type ShapeOf<S extends Record<string, ParamSchema<any>>> = {
    [K in keyof S]: S[K] extends ParamSchema<infer T> ? T : never;
};
declare function objectSchema<S extends Record<string, ParamSchema<any>>>(shape: S): Builder<ShapeOf<S>>;
/** Schema builders. `p.object({ ms: p.number({ min: 0 }).default(250) })`. */
export declare const p: {
    number: typeof numberSchema;
    string: typeof stringSchema;
    boolean: typeof booleanSchema;
    enum: typeof enumSchema;
    object: typeof objectSchema;
};
/** Safe `describe()` access for arbitrary (possibly zod) schemas. */
export declare function describeSchema(schema: ParamSchema<any> | undefined): ParamFieldDescription | null;
export {};
