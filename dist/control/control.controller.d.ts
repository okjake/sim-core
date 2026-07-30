import { RequestTailService, type RequestTailEntry } from '../request-tail/request-tail.service';
import type { ScenarioListing } from '../scenarios/scenario.types';
import { ControlService, type ControlState } from './control.service';
/**
 * The control plane. Every route requires `Authorization: Bearer ${CONTROL_TOKEN}`.
 * Deliberately NOT part of `/openapi.json` — see OpenApiController.
 */
export declare class ControlController {
    private readonly control;
    private readonly tail;
    constructor(control: ControlService, tail: RequestTailService);
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
}
