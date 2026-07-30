"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = slugify;
exports.loadContent = loadContent;
exports.seedFromContent = seedFromContent;
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const frontmatter_1 = require("./frontmatter");
const EMPTY = {
    specVersions: 0,
    guides: 0,
    changelog: 0,
    activeSpec: null,
    found: false,
};
function listFiles(dir, ext) {
    if (!(0, node_fs_1.existsSync)(dir))
        return [];
    return (0, node_fs_1.readdirSync)(dir)
        .filter((name) => (0, node_path_1.extname)(name).toLowerCase() === ext && !name.startsWith('.'))
        .sort();
}
/** `Charges Lifecycle.md` → `charges-lifecycle`. */
function slugify(input) {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
function readManifest(contentDir, logger) {
    const file = (0, node_path_1.join)(contentDir, 'docs.json');
    if (!(0, node_fs_1.existsSync)(file))
        return {};
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(file, 'utf8'));
    }
    catch (error) {
        logger.warn(`content/docs.json is not valid JSON — ignoring it (${String(error)})`);
        return {};
    }
}
/**
 * Read a `content/` directory into plain records. Pure I/O + parsing, no
 * database — which is what makes the seeding format testable on its own.
 *
 * ```
 * content/
 *   docs.json            optional manifest: { activeSpec, guides }
 *   specs/*.json         OpenAPI documents; filename (sans .json) is the label
 *   guides/*.md          frontmatter: title, slug?, published?, order?
 *   changelog/*.md       frontmatter: date (YYYY-MM-DD), title, id?, published?
 * ```
 */
function loadContent(contentDir, logger = new common_1.Logger('SimDocs')) {
    if (!(0, node_fs_1.existsSync)(contentDir)) {
        return { specs: [], guides: [], changelog: [], activeSpec: null, found: false };
    }
    const manifest = readManifest(contentDir, logger);
    // --- specs
    const specDir = (0, node_path_1.join)(contentDir, 'specs');
    const specFiles = listFiles(specDir, '.json');
    const specs = [];
    for (const file of specFiles) {
        const label = (0, node_path_1.basename)(file, '.json');
        try {
            const spec = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(specDir, file), 'utf8'));
            if (!spec?.openapi || !spec.info) {
                logger.warn(`content/specs/${file} is not an OpenAPI document (needs openapi + info)`);
                continue;
            }
            specs.push({ label, spec });
        }
        catch (error) {
            logger.warn(`content/specs/${file} could not be parsed — skipping (${String(error)})`);
        }
    }
    let activeSpec = null;
    if (specs.length > 0) {
        const labels = specs.map((s) => s.label);
        if (manifest.activeSpec && labels.includes(manifest.activeSpec)) {
            activeSpec = manifest.activeSpec;
        }
        else {
            if (manifest.activeSpec) {
                logger.warn(`content/docs.json activeSpec "${manifest.activeSpec}" matches no spec file — falling back`);
            }
            else if (specs.length > 1) {
                logger.warn(`content/specs has ${specs.length} files and no docs.json activeSpec — publishing "${labels[0]}"`);
            }
            activeSpec = labels[0] ?? null;
        }
        for (const spec of specs) {
            spec.publish = spec.label === activeSpec;
        }
    }
    // --- guides
    const guideDir = (0, node_path_1.join)(contentDir, 'guides');
    const guideOrder = manifest.guides ?? [];
    const guides = [];
    for (const file of listFiles(guideDir, '.md')) {
        const { data, body } = (0, frontmatter_1.parseFrontmatter)((0, node_fs_1.readFileSync)((0, node_path_1.join)(guideDir, file), 'utf8'));
        const slug = (0, frontmatter_1.readString)(data, 'slug') ?? slugify((0, node_path_1.basename)(file, '.md'));
        const manifestIndex = guideOrder.indexOf(slug);
        guides.push({
            slug,
            title: (0, frontmatter_1.readString)(data, 'title') ?? (0, node_path_1.basename)(file, '.md'),
            markdown: body,
            published: (0, frontmatter_1.readBoolean)(data, 'published', true),
            // Manifest order wins; then frontmatter `order`; then 1000 (sorts last).
            order: manifestIndex >= 0
                ? manifestIndex
                : (0, frontmatter_1.readNumber)(data, 'order', guideOrder.length + 1000),
        });
    }
    // --- changelog
    const changelogDir = (0, node_path_1.join)(contentDir, 'changelog');
    const changelog = [];
    for (const file of listFiles(changelogDir, '.md')) {
        const { data, body } = (0, frontmatter_1.parseFrontmatter)((0, node_fs_1.readFileSync)((0, node_path_1.join)(changelogDir, file), 'utf8'));
        const name = (0, node_path_1.basename)(file, '.md');
        // `2026-07-30-additive-fields.md` yields both a date and a stable id.
        const fromName = /^(\d{4}-\d{2}-\d{2})(?:[-_](.*))?$/.exec(name);
        const date = (0, frontmatter_1.readString)(data, 'date') ?? fromName?.[1];
        if (!date) {
            logger.warn(`content/changelog/${file} has no date (frontmatter \`date:\` or a YYYY-MM-DD filename prefix) — skipping`);
            continue;
        }
        changelog.push({
            id: (0, frontmatter_1.readString)(data, 'id') ?? slugify(name),
            date,
            title: (0, frontmatter_1.readString)(data, 'title') ?? fromName?.[2] ?? name,
            markdown: body,
            published: (0, frontmatter_1.readBoolean)(data, 'published', true),
        });
    }
    return { specs, guides, changelog, activeSpec, found: true };
}
/** Load `contentDir` and write it into an (assumed empty) docs database. */
function seedFromContent(repo, contentDir, logger = new common_1.Logger('SimDocs')) {
    const content = loadContent(contentDir, logger);
    if (!content.found) {
        logger.log(`no content directory at ${contentDir} — docs start empty`);
        return { ...EMPTY, contentDir };
    }
    for (const spec of content.specs)
        repo.createSpecVersion(spec);
    for (const guide of content.guides)
        repo.upsertGuide(guide);
    for (const entry of content.changelog)
        repo.upsertChangelogEntry(entry);
    const result = {
        specVersions: content.specs.length,
        guides: content.guides.length,
        changelog: content.changelog.length,
        activeSpec: content.activeSpec,
        contentDir,
        found: true,
    };
    logger.log(`seeded docs from ${contentDir}: ${result.specVersions} spec version(s) ` +
        `(active "${result.activeSpec ?? 'none'}"), ${result.guides} guide(s), ` +
        `${result.changelog} changelog entr(ies)`);
    return result;
}
