import { Injectable } from '@nestjs/common';

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

export const REQUEST_TAIL_CAPACITY = 200;

/** Fixed-size in-memory ring buffer of the last {@link REQUEST_TAIL_CAPACITY} requests. */
@Injectable()
export class RequestTailService {
  private readonly buffer: RequestTailEntry[] = [];
  private seq = 0;

  constructor(private readonly capacity: number = REQUEST_TAIL_CAPACITY) {}

  record(entry: Omit<RequestTailEntry, 'seq' | 'at'>): RequestTailEntry {
    this.seq += 1;
    const full: RequestTailEntry = {
      ...entry,
      seq: this.seq,
      at: new Date().toISOString(),
    };
    this.buffer.push(full);
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
    return full;
  }

  /** Most recent first. */
  list(limit = this.capacity): RequestTailEntry[] {
    const bounded = Math.max(1, Math.min(limit, this.capacity));
    return this.buffer.slice(-bounded).reverse();
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer.length = 0;
  }
}
