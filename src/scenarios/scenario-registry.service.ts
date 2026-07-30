import { Injectable } from '@nestjs/common';

import { describeSchema } from '../params';
import { BUILTIN_SCENARIOS } from './builtin-scenarios';
import type { Scenario, ScenarioListing } from './scenario.types';

/**
 * Named scenario registry. Built-ins are registered first; a consumer-supplied
 * scenario with the same `id` replaces the built-in of that name.
 */
@Injectable()
export class ScenarioRegistryService {
  private readonly scenarios = new Map<string, Scenario<any>>();

  constructor(consumerScenarios: Scenario<any>[] = []) {
    for (const scenario of [...BUILTIN_SCENARIOS, ...consumerScenarios]) {
      this.register(scenario);
    }
  }

  register(scenario: Scenario<any>): void {
    if (!scenario.id || typeof scenario.apply !== 'function') {
      throw new Error(
        `Invalid scenario registration: ${JSON.stringify(scenario?.id ?? scenario)}`,
      );
    }
    this.scenarios.set(scenario.id, scenario);
  }

  has(id: string): boolean {
    return this.scenarios.has(id);
  }

  get(id: string): Scenario<any> | undefined {
    return this.scenarios.get(id);
  }

  ids(): string[] {
    return [...this.scenarios.keys()].sort();
  }

  list(): ScenarioListing[] {
    return [...this.scenarios.values()]
      .map((scenario) => ({
        id: scenario.id,
        description: scenario.description,
        params: describeSchema(scenario.params),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
