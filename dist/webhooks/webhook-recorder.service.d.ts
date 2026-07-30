/** Default ring-buffer size for received webhook events. */
export declare const WEBHOOK_RECORDER_CAPACITY = 50;
/** Bodies are truncated to keep the control response small and boring. */
export declare const WEBHOOK_BODY_PREVIEW_CHARS = 4000;
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
export declare class WebhookRecorderService {
    private readonly buffer;
    private seq;
    readonly capacity: number;
    constructor(capacity?: number);
    record(input: RecordWebhookInput): RecordedWebhook;
    /** Newest first. */
    list(limit?: number): RecordedWebhook[];
    size(): number;
    clear(): void;
}
