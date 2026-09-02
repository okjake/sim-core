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
exports.DocsService = void 0;
exports.contentEtag = contentEtag;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const config_1 = require("../config");
const conditional_1 = require("../http/conditional");
const openapi_controller_1 = require("../builtins/openapi.controller");
const storage_service_1 = require("../storage/storage.service");
const docs_repository_1 = require("./docs.repository");
const docs_render_1 = require("./docs.render");
const docs_seed_1 = require("./docs.seed");
/** Same 32-hex shape v0.1.0 used, so consumers' ETag assertions keep passing. */
function contentEtag(body) {
    return `"${(0, node_crypto_1.createHash)('sha256').update(body).digest('hex').slice(0, 32)}"`;
}
/**
 * The docs engine.
 *
 * Only instantiated when `config.docs.enabled` is true — a v0.1.0-style
 * consumer never loads it, never opens SQLite, and keeps serving
 * `config.openapi` verbatim from `OpenApiController`.
 */
let DocsService = class DocsService {
    simConfig;
    logger = new common_1.Logger('SimDocs');
    storage;
    fallback;
    repo;
    config;
    siteTitle;
    contentDir;
    /** Recomputed on publish, not per request. */
    served = null;
    seedResult = null;
    constructor(simConfig) {
        this.simConfig = simConfig;
        const docs = simConfig.docs ?? {};
        this.config = {
            ...docs,
            authMode: docs.authMode ?? 'public',
            contentDir: docs.contentDir ?? (0, node_path_1.resolve)(process.cwd(), 'content'),
            seedOnBoot: docs.seedOnBoot ?? true,
        };
        this.contentDir = this.config.contentDir;
        this.siteTitle =
            docs.title ?? `${simConfig.brand?.displayName ?? simConfig.name} developer docs`;
        this.storage = new storage_service_1.SimStorage({
            file: docs.databaseFile,
            dataDir: docs.dataDir,
            driver: docs.databaseDriver,
            migrations: docs_repository_1.DOCS_MIGRATIONS,
        });
        this.repo = new docs_repository_1.DocsRepository(this.storage);
        // The static config spec is the safety net: a sim always serves *something*
        // at /openapi.json, even before the first publish.
        const body = JSON.stringify((0, openapi_controller_1.stripControlPaths)(simConfig.openapi));
        const bootedAt = Date.now();
        this.fallback = {
            body,
            etag: contentEtag(body),
            lastModified: (0, conditional_1.httpDate)(bootedAt),
            lastModifiedMs: bootedAt,
            version: null,
        };
        if (this.config.seedOnBoot && this.repo.isEmpty()) {
            this.seedResult = (0, docs_seed_1.seedFromContent)(this.repo, this.contentDir, this.logger);
        }
        this.refreshServedSpec();
    }
    onModuleDestroy() {
        this.storage.close();
    }
    // ------------------------------------------------------------------ openapi
    /** Cached body + validators for `GET /openapi.json`. */
    activeSpec() {
        return this.served ?? this.fallback;
    }
    /** Call after anything that could change which spec version is active. */
    refreshServedSpec() {
        const active = this.repo.getActiveSpecVersion();
        if (!active || active.publishedAt === null) {
            this.served = null;
            return this.fallback;
        }
        const body = JSON.stringify((0, openapi_controller_1.stripControlPaths)(active.spec));
        const publishedMs = Date.parse(active.publishedAt);
        const lastModifiedMs = Number.isNaN(publishedMs) ? Date.now() : publishedMs;
        this.served = {
            body,
            etag: contentEtag(body),
            lastModified: (0, conditional_1.httpDate)(lastModifiedMs),
            lastModifiedMs,
            version: {
                id: active.id,
                label: active.label,
                createdAt: active.createdAt,
                publishedAt: active.publishedAt,
                active: true,
            },
        };
        return this.served;
    }
    // ------------------------------------------------------------ spec versions
    listSpecVersions() {
        return this.repo.listSpecVersions();
    }
    getSpecVersion(id) {
        const version = this.repo.getSpecVersion(id);
        if (!version) {
            throw new common_1.NotFoundException({
                error: 'unknown_spec_version',
                message: `No spec version with id "${id}"`,
            });
        }
        return version;
    }
    createSpecVersion(input) {
        const created = this.repo.createSpecVersion(input);
        if (created.active)
            this.refreshServedSpec();
        return created;
    }
    /** Seed a draft from whatever is currently active (or from `config.openapi`). */
    draftFromActive(label) {
        const active = this.repo.getActiveSpecVersion();
        const spec = active ? active.spec : this.simConfig.openapi;
        return this.createSpecVersion({ label, spec });
    }
    updateSpecVersion(id, patch) {
        return this.repo.updateSpecVersion(id, patch);
    }
    publishSpecVersion(id) {
        const published = this.repo.publishSpecVersion(id);
        this.refreshServedSpec();
        this.logger.log(`published spec version "${published.label}" (${published.id})`);
        return published;
    }
    /** Publish by label — how a consumer scenario activates a checked-in preset. */
    publishSpecVersionByLabel(label) {
        const version = this.repo.getSpecVersionByLabel(label);
        if (!version) {
            throw new common_1.NotFoundException({
                error: 'unknown_spec_version',
                message: `No spec version labelled "${label}"`,
                available: this.repo.listSpecVersions().map((v) => v.label),
            });
        }
        return this.publishSpecVersion(version.id);
    }
    deleteSpecVersion(id) {
        this.repo.deleteSpecVersion(id);
    }
    // -------------------------------------------------------- guides + changelog
    listGuides(onlyPublished = false) {
        return this.repo.listGuides(onlyPublished);
    }
    getGuide(slug) {
        const guide = this.repo.getGuide(slug);
        if (!guide) {
            throw new common_1.NotFoundException({
                error: 'unknown_guide',
                message: `No guide with slug "${slug}"`,
            });
        }
        return guide;
    }
    upsertGuide(input) {
        return this.repo.upsertGuide(input);
    }
    deleteGuide(slug) {
        this.repo.deleteGuide(slug);
    }
    listChangelog(onlyPublished = false) {
        return this.repo.listChangelog(onlyPublished);
    }
    upsertChangelogEntry(input) {
        return this.repo.upsertChangelogEntry(input);
    }
    deleteChangelogEntry(id) {
        this.repo.deleteChangelogEntry(id);
    }
    // ------------------------------------------------------------------ seeding
    /** Wipe every docs table and reseed from `content/`. */
    resetDocs() {
        this.repo.wipe();
        this.seedResult = (0, docs_seed_1.seedFromContent)(this.repo, this.contentDir, this.logger);
        this.refreshServedSpec();
        this.logger.log('docs reset — tables wiped and reseeded from content/');
        return this.seedResult;
    }
    lastSeed() {
        return this.seedResult;
    }
    // ------------------------------------------------------------------ rendering
    get accent() {
        return this.simConfig.brand?.color ?? '#3b6ea5';
    }
    renderIndex() {
        const active = this.repo.getActiveSpecVersion();
        return (0, docs_render_1.renderDocsIndex)({
            siteTitle: this.siteTitle,
            accent: this.accent,
            intro: this.config.intro,
            activeSpecLabel: active?.label ?? null,
            guides: this.repo.listGuides(true),
            hasChangelog: this.repo.listChangelog(true).length > 0,
        });
    }
    renderReference() {
        const active = this.repo.getActiveSpecVersion();
        return (0, docs_render_1.renderReferencePage)({
            siteTitle: this.siteTitle,
            accent: this.accent,
            activeSpecLabel: active?.label ?? null,
        });
    }
    /** Drafts 404 on the public surface — that is the whole point of the split. */
    renderGuide(slug) {
        const guide = this.repo.getGuide(slug);
        if (!guide || !guide.published) {
            return {
                html: (0, docs_render_1.renderNotFoundPage)(this.siteTitle, this.accent, `There is no published guide at /docs/guides/${slug}.`),
                found: false,
            };
        }
        return {
            html: (0, docs_render_1.renderGuidePage)({ siteTitle: this.siteTitle, accent: this.accent, guide }),
            found: true,
        };
    }
    renderChangelog() {
        return (0, docs_render_1.renderChangelogPage)({
            siteTitle: this.siteTitle,
            accent: this.accent,
            entries: this.repo.listChangelog(true),
        });
    }
    // -------------------------------------------------------------------- status
    status() {
        return {
            enabled: true,
            authMode: this.config.authMode,
            databaseFile: this.storage.file,
            contentDir: this.contentDir,
            chaosOptIn: this.simConfig.docsChaosOptIn === true,
            counts: this.repo.counts(),
            activeSpec: this.activeSpec().version,
            migrations: this.storage.applied().map((m) => m.id),
        };
    }
};
exports.DocsService = DocsService;
exports.DocsService = DocsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(config_1.SIM_CORE_CONFIG)),
    __metadata("design:paramtypes", [Object])
], DocsService);
