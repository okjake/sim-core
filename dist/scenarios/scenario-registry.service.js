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
exports.ScenarioRegistryService = void 0;
const common_1 = require("@nestjs/common");
const params_1 = require("../params");
const builtin_scenarios_1 = require("./builtin-scenarios");
/**
 * Named scenario registry. Built-ins are registered first; a consumer-supplied
 * scenario with the same `id` replaces the built-in of that name.
 */
let ScenarioRegistryService = class ScenarioRegistryService {
    scenarios = new Map();
    constructor(consumerScenarios = []) {
        for (const scenario of [...builtin_scenarios_1.BUILTIN_SCENARIOS, ...consumerScenarios]) {
            this.register(scenario);
        }
    }
    register(scenario) {
        if (!scenario.id || typeof scenario.apply !== 'function') {
            throw new Error(`Invalid scenario registration: ${JSON.stringify(scenario?.id ?? scenario)}`);
        }
        this.scenarios.set(scenario.id, scenario);
    }
    has(id) {
        return this.scenarios.has(id);
    }
    get(id) {
        return this.scenarios.get(id);
    }
    ids() {
        return [...this.scenarios.keys()].sort();
    }
    list() {
        return [...this.scenarios.values()]
            .map((scenario) => ({
            id: scenario.id,
            description: scenario.description,
            params: (0, params_1.describeSchema)(scenario.params),
            admin: scenario.admin ?? null,
        }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }
};
exports.ScenarioRegistryService = ScenarioRegistryService;
exports.ScenarioRegistryService = ScenarioRegistryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Array])
], ScenarioRegistryService);
