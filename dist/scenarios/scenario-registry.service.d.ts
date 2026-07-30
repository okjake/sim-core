import type { Scenario, ScenarioListing } from './scenario.types';
/**
 * Named scenario registry. Built-ins are registered first; a consumer-supplied
 * scenario with the same `id` replaces the built-in of that name.
 */
export declare class ScenarioRegistryService {
    private readonly scenarios;
    constructor(consumerScenarios?: Scenario<any>[]);
    register(scenario: Scenario<any>): void;
    has(id: string): boolean;
    get(id: string): Scenario<any> | undefined;
    ids(): string[];
    list(): ScenarioListing[];
}
