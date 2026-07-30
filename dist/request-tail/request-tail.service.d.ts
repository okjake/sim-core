export interface RequestTailEntry {
    /** Monotonic per-process sequence number. */
    seq: number;
    /** ISO-8601 timestamp of when the response completed. */
    at: string;
    method: string;
    path: string;
    status: number;
    latencyMs: number;
    /** Chaos primitives applied to this request, if any. */
    chaos?: string[];
}
export declare const REQUEST_TAIL_CAPACITY = 200;
/** Fixed-size in-memory ring buffer of the last {@link REQUEST_TAIL_CAPACITY} requests. */
export declare class RequestTailService {
    private readonly capacity;
    private readonly buffer;
    private seq;
    constructor(capacity?: number);
    record(entry: Omit<RequestTailEntry, 'seq' | 'at'>): RequestTailEntry;
    /** Most recent first. */
    list(limit?: number): RequestTailEntry[];
    size(): number;
    clear(): void;
}
