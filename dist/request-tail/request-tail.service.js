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
exports.RequestTailService = exports.REQUEST_TAIL_CAPACITY = void 0;
const common_1 = require("@nestjs/common");
exports.REQUEST_TAIL_CAPACITY = 200;
/** Fixed-size in-memory ring buffer of the last {@link REQUEST_TAIL_CAPACITY} requests. */
let RequestTailService = class RequestTailService {
    capacity;
    buffer = [];
    seq = 0;
    constructor(capacity = exports.REQUEST_TAIL_CAPACITY) {
        this.capacity = capacity;
    }
    record(entry) {
        this.seq += 1;
        const full = {
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
    list(limit = this.capacity) {
        const bounded = Math.max(1, Math.min(limit, this.capacity));
        return this.buffer.slice(-bounded).reverse();
    }
    size() {
        return this.buffer.length;
    }
    clear() {
        this.buffer.length = 0;
    }
};
exports.RequestTailService = RequestTailService;
exports.RequestTailService = RequestTailService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Number])
], RequestTailService);
