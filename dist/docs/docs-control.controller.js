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
exports.DocsControlController = void 0;
const common_1 = require("@nestjs/common");
const control_guard_1 = require("../control/control.guard");
const docs_dto_1 = require("./docs.dto");
const markdown_1 = require("./markdown");
const docs_service_1 = require("./docs.service");
/**
 * The docs editor's backend, behind the same bearer token as the rest of the
 * control plane. Registered only when `docs.enabled` is true; a docs-disabled
 * service 404s these paths, which is how the admin SPA decides whether to show
 * the Docs tab.
 *
 * Drafts and unpublished guides ARE visible here — that is the difference
 * between the control plane and the public `/docs` surface.
 */
let DocsControlController = class DocsControlController {
    docs;
    constructor(docs) {
        this.docs = docs;
    }
    status() {
        return this.docs.status();
    }
    // ------------------------------------------------------------ spec versions
    listSpecVersions() {
        return { specVersions: this.docs.listSpecVersions() };
    }
    getSpecVersion(id) {
        return this.docs.getSpecVersion(id);
    }
    createSpecVersion(body) {
        const input = (0, docs_dto_1.parseCreateSpecVersionBody)(body);
        const created = input.spec
            ? this.docs.createSpecVersion({ label: input.label, spec: input.spec })
            : this.docs.draftFromActive(input.label);
        return input.publish ? this.docs.publishSpecVersion(created.id) : created;
    }
    updateSpecVersion(id, body) {
        return this.docs.updateSpecVersion(id, (0, docs_dto_1.parseUpdateSpecVersionBody)(body));
    }
    publishSpecVersion(id) {
        return this.docs.publishSpecVersion(id);
    }
    deleteSpecVersion(id) {
        this.docs.deleteSpecVersion(id);
        return { deleted: id };
    }
    // ------------------------------------------------------------------- guides
    listGuides() {
        return { guides: this.docs.listGuides() };
    }
    getGuide(slug) {
        return this.docs.getGuide(slug);
    }
    upsertGuide(slug, body) {
        return this.docs.upsertGuide((0, docs_dto_1.parseGuideBody)(body, slug));
    }
    createGuide(body) {
        return this.docs.upsertGuide((0, docs_dto_1.parseGuideBody)(body));
    }
    deleteGuide(slug) {
        this.docs.deleteGuide(slug);
        return { deleted: slug };
    }
    // ---------------------------------------------------------------- changelog
    listChangelog() {
        return { changelog: this.docs.listChangelog() };
    }
    createChangelogEntry(body) {
        return this.docs.upsertChangelogEntry((0, docs_dto_1.parseChangelogBody)(body));
    }
    upsertChangelogEntry(id, body) {
        return this.docs.upsertChangelogEntry((0, docs_dto_1.parseChangelogBody)(body, id));
    }
    deleteChangelogEntry(id) {
        this.docs.deleteChangelogEntry(id);
        return { deleted: id };
    }
    // ------------------------------------------------------------------ preview
    /**
     * Render markdown with the *same* renderer the public pages use, so the
     * editor preview cannot drift from what will actually be published.
     */
    preview(body) {
        return { html: (0, markdown_1.renderMarkdown)((0, docs_dto_1.parsePreviewBody)(body)) };
    }
};
exports.DocsControlController = DocsControlController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "status", null);
__decorate([
    (0, common_1.Get)('spec-versions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "listSpecVersions", null);
__decorate([
    (0, common_1.Get)('spec-versions/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "getSpecVersion", null);
__decorate([
    (0, common_1.Post)('spec-versions'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "createSpecVersion", null);
__decorate([
    (0, common_1.Patch)('spec-versions/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "updateSpecVersion", null);
__decorate([
    (0, common_1.Post)('spec-versions/:id/publish'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "publishSpecVersion", null);
__decorate([
    (0, common_1.Delete)('spec-versions/:id'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "deleteSpecVersion", null);
__decorate([
    (0, common_1.Get)('guides'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "listGuides", null);
__decorate([
    (0, common_1.Get)('guides/:slug'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "getGuide", null);
__decorate([
    (0, common_1.Put)('guides/:slug'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "upsertGuide", null);
__decorate([
    (0, common_1.Post)('guides'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "createGuide", null);
__decorate([
    (0, common_1.Delete)('guides/:slug'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "deleteGuide", null);
__decorate([
    (0, common_1.Get)('changelog'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "listChangelog", null);
__decorate([
    (0, common_1.Post)('changelog'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "createChangelogEntry", null);
__decorate([
    (0, common_1.Put)('changelog/:id'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "upsertChangelogEntry", null);
__decorate([
    (0, common_1.Delete)('changelog/:id'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "deleteChangelogEntry", null);
__decorate([
    (0, common_1.Post)('preview'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], DocsControlController.prototype, "preview", null);
exports.DocsControlController = DocsControlController = __decorate([
    (0, common_1.Controller)('__control/docs'),
    (0, common_1.UseGuards)(control_guard_1.ControlAuthGuard),
    __metadata("design:paramtypes", [docs_service_1.DocsService])
], DocsControlController);
