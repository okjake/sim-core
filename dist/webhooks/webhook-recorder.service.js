"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookRecorderService = exports.WEBHOOK_BODY_PREVIEW_CHARS = exports.WEBHOOK_RECORDER_CAPACITY = void 0;
const common_1 = require("@nestjs/common");
/** Default ring-buffer size for received webhook events. */
exports.WEBHOOK_RECORDER_CAPACITY = 50;
/** Bodies are truncated to keep the control response small and boring. */
exports.WEBHOOK_BODY_PREVIEW_CHARS = 4_000;
/**
 * In-memory ring buffer of the last N received webhooks, exposed at
 * `GET /__control/webhooks`.
 *
 * Always provided, docs on or off — it is a few kilobytes and being able to ask
 * a sim "did you actually get the delivery?" is the difference between five
 * minutes and an afternoon when the platform's webhook fan-out is being
 * debugged.
 */
let WebhookRecorderService = class WebhookRecorderService {
    buffer = [];
    seq = 0;
    capacity;
    constructor(capacity = exports.WEBHOOK_RECORDER_CAPACITY) {
        this.capacity = capacity > 0 ? Math.floor(capacity) : exports.WEBHOOK_RECORDER_CAPACITY;
    }
    record(input) {
        this.seq += 1;
        const entry = {
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
    list(limit = this.capacity) {
        const bounded = Math.max(0, Math.min(Math.floor(limit), this.capacity));
        return this.buffer.slice(-bounded).reverse();
    }
    size() {
        return this.buffer.length;
    }
    clear() {
        this.buffer.length = 0;
    }
};
exports.WebhookRecorderService = WebhookRecorderService;
exports.WebhookRecorderService = WebhookRecorderService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Number])
], WebhookRecorderService);
/** Best-effort event-type sniffing across the shapes the platform sends. */
function eventOf(body) {
    if (!body || typeof body !== 'object')
        return null;
    const record = body;
    for (const key of ['event', 'type', 'eventType', 'event_type']) {
        const value = record[key];
        if (typeof value === 'string' && value.length > 0)
            return value;
    }
    return null;
}
function truncate(body) {
    if (body === undefined)
        return null;
    try {
        const json = JSON.stringify(body);
        if (json === undefined)
            return null;
        if (json.length <= exports.WEBHOOK_BODY_PREVIEW_CHARS)
            return body;
        return { truncated: true, preview: json.slice(0, exports.WEBHOOK_BODY_PREVIEW_CHARS) };
    }
    catch {
        return { unserializable: true };
    }
}
