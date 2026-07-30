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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlController = void 0;
const common_1 = require("@nestjs/common");
const request_tail_service_1 = require("../request-tail/request-tail.service");
const control_dto_1 = require("./control.dto");
const control_guard_1 = require("./control.guard");
const control_service_1 = require("./control.service");
/**
 * The control plane. Every route requires `Authorization: Bearer ${CONTROL_TOKEN}`.
 * Deliberately NOT part of `/openapi.json` — see OpenApiController.
 */
let ControlController = class ControlController {
    control;
    tail;
    constructor(control, tail) {
        this.control = control;
        this.tail = tail;
    }
    state() {
        return this.control.state();
    }
    scenarios() {
        return { scenarios: this.control.listScenarios() };
    }
    /** Additive to the spec table: the admin SPA's request-tail view reads this. */
    requests(limit) {
        const parsed = Number(limit);
        const bounded = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 50;
        return { requests: this.tail.list(bounded) };
    }
    activate(body) {
        return this.control.activateScenario((0, control_dto_1.parseActivateScenarioBody)(body));
    }
    driver(body) {
        return this.control.setDriverOverride((0, control_dto_1.parseDriverOverrideBody)(body));
    }
    reset() {
        return this.control.reset();
    }
};
exports.ControlController = ControlController;
__decorate([
    (0, common_1.Get)('state'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], ControlController.prototype, "state", null);
__decorate([
    (0, common_1.Get)('scenarios'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], ControlController.prototype, "scenarios", null);
__decorate([
    (0, common_1.Get)('requests'),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], ControlController.prototype, "requests", null);
__decorate([
    (0, common_1.Post)('scenario'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ControlController.prototype, "activate", null);
__decorate([
    (0, common_1.Post)('driver'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], ControlController.prototype, "driver", null);
__decorate([
    (0, common_1.Post)('reset'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ControlController.prototype, "reset", null);
exports.ControlController = ControlController = __decorate([
    (0, common_1.Controller)('__control'),
    (0, common_1.UseGuards)(control_guard_1.ControlAuthGuard),
    __metadata("design:paramtypes", [control_service_1.ControlService,
        request_tail_service_1.RequestTailService])
], ControlController);
