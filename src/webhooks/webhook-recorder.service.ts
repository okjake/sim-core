import { Injectable } from '@nestjs/common';

/** Default ring-buffer size for received webhook events. */
export const WEBHOOK_RECORDER_CAPACITY = 50;

/** Bodies are truncated to keep the control response small and boring. */
export const WEBHOOK_BODY_PREVIEW_CHARS = 4_000;

export interface RecordedWebhook {
  seq: number;
  /** ISO-8601. */
  at: string;
  path: string;
  /** Event type, if the receiver could work one out (`integration.breaking_change`). */
  event: string | null;
  /** Did the HMAC check pass? Rejected deliveries are recorded too — that is the interesting case. */
  verified: boolean;
  /** Status the receiver responded with. */
  status: number;
  /** Parsed body, truncated. Never the raw signature or secret. */
  body: unknown;
}

export interface RecordWebhookInput {
  path: string;
  verified: boolean;
  status?: number;
  event?: string | null;
  body?: unknown;
}

/**
 * In-memory ring buffer of the last N received webhooks, exposed at
 * `GET /__control/webhooks`.
 *
 * Always provided, docs on or off — it is a few kilobytes and being able to ask
 * a sim "did you actually get the delivery?" is the difference between five
 * minutes and an afternoon when the platform's webhook fan-out is being
 * debugged.
 */
@Injectable()
export class WebhookRecorderService {
  private readonly buffer: RecordedWebhook[] = [];
  private seq = 0;

  readonly capacity: number;

  constructor(capacity: number = WEBHOOK_RECORDER_CAPACITY) {
    this.capacity = capacity > 0 ? Math.floor(capacity) : WEBHOOK_RECORDER_CAPACITY;
  }

  record(input: RecordWebhookInput): RecordedWebhook {
    this.seq += 1;
    const entry: RecordedWebhook = {
      seq: this.seq,
      at: new Date().toISOString(),
      path: input.path,
      event: input.event ?? eventOf(input.body),
      verified: input.verified,
      status: input.status ?? (input.verified ? 200 : 401),
      body: truncate(input.body),
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
    return entry;
  }

  /** Newest first. */
  list(limit = this.capacity): RecordedWebhook[] {
    const bounded = Math.max(0, Math.min(Math.floor(limit), this.capacity));
    return this.buffer.slice(-bounded).reverse();
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer.length = 0;
  }
}

/** Best-effort event-type sniffing across the shapes the platform sends. */
function eventOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  for (const key of ['event', 'type', 'eventType', 'event_type']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function truncate(body: unknown): unknown {
  if (body === undefined) return null;
  try {
    const json = JSON.stringify(body);
    if (json === undefined) return null;
    if (json.length <= WEBHOOK_BODY_PREVIEW_CHARS) return body;
    return { truncated: true, preview: json.slice(0, WEBHOOK_BODY_PREVIEW_CHARS) };
  } catch {
    return { unserializable: true };
  }
}
