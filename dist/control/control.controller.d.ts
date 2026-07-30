import { DocsService } from '../docs/docs.service';
import type { SeedResult } from '../docs/docs.seed';
import { RequestTailService, type RequestTailEntry } from '../request-tail/request-tail.service';
import type { ScenarioListing } from '../scenarios/scenario.types';
import { WebhookRecorderService, type RecordedWebhook } from '../webhooks/webhook-recorder.service';
import { ControlService, type ControlState } from './control.service';
/**
 * The control plane. Every route requires `Authorization: Bearer ${CONTROL_TOKEN}`.
 * Deliberately NOT part of `/openapi.json` — see OpenApiController.
 */
export declare class ControlController {
    private readonly control;
    private readonly tail;
    private readonly webhooks;
    private readonly docs?;
    constructor(control: ControlService, tail: RequestTailService, webhooks: WebhookRecorderService, docs?: DocsService | undefined);
    state(): ControlState;
    scenarios(): {
        scenarios: ScenarioListing[];
    };
    /** Additive to the spec table: the admin SPA's request-tail view reads this. */
    requests(limit?: string): {
        requests: RequestTailEntry[];
    };
    activate(body: unknown): Promise<ControlState>;
    driver(body: unknown): ControlState;
    reset(): Promise<ControlState>;
    /**
     * Last N received webhooks, newest first. Always available — the recorder is
     * a few kB of memory and does not depend on the docs engine.
     */
    webhookEvents(limit?: string): {
        capacity: number;
        size: number;
        webhooks: RecordedWebhook[];
    };
    /**
     * Wipe the docs tables and reseed from the consumer's `content/` directory.
     *
     * Docs are durable state, so unlike scenarios this has no TTL and does not
     * auto-revert — it is the docs equivalent of `POST /__control/reset` and the
     * way to get a sim back to its checked-in baseline after an editing session.
     */
    resetDocs(): SeedResult;
}
