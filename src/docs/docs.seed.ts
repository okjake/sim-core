import { Logger } from '@nestjs/common';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import type { OpenApiDocument } from '../config';
import type {
  ChangelogEntryInput,
  DocsRepository,
  GuideInput,
  SpecVersionInput,
} from './docs.repository';
import { parseFrontmatter, readBoolean, readNumber, readString } from './frontmatter';

/**
 * Optional `content/docs.json`. Everything in it is optional too — a service
 * with a single spec file needs no manifest at all.
 */
export interface DocsManifest {
  /** Label (spec filename without `.json`) to publish + activate on seed. */
  activeSpec?: string;
  /** Explicit guide ordering by slug; unlisted guides sort after, by title. */
  guides?: string[];
}

export interface SeedResult {
  specVersions: number;
  guides: number;
  changelog: number;
  activeSpec: string | null;
  contentDir: string;
  /** False when the directory does not exist — a normal, non-fatal state. */
  found: boolean;
}

const EMPTY: Omit<SeedResult, 'contentDir'> = {
  specVersions: 0,
  guides: 0,
  changelog: 0,
  activeSpec: null,
  found: false,
};

function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => extname(name).toLowerCase() === ext && !name.startsWith('.'))
    .sort();
}

/** `Charges Lifecycle.md` → `charges-lifecycle`. */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readManifest(contentDir: string, logger: Logger): DocsManifest {
  const file = join(contentDir, 'docs.json');
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as DocsManifest;
  } catch (error) {
    logger.warn(`content/docs.json is not valid JSON — ignoring it (${String(error)})`);
    return {};
  }
}

export interface LoadedContent {
  specs: SpecVersionInput[];
  guides: GuideInput[];
  changelog: ChangelogEntryInput[];
  activeSpec: string | null;
  found: boolean;
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
export function loadContent(contentDir: string, logger = new Logger('SimDocs')): LoadedContent {
  if (!existsSync(contentDir)) {
    return { specs: [], guides: [], changelog: [], activeSpec: null, found: false };
  }

  const manifest = readManifest(contentDir, logger);

  // --- specs
  const specDir = join(contentDir, 'specs');
  const specFiles = listFiles(specDir, '.json');
  const specs: SpecVersionInput[] = [];

  for (const file of specFiles) {
    const label = basename(file, '.json');
    try {
      const spec = JSON.parse(readFileSync(join(specDir, file), 'utf8')) as OpenApiDocument;
      if (!spec?.openapi || !spec.info) {
        logger.warn(`content/specs/${file} is not an OpenAPI document (needs openapi + info)`);
        continue;
      }
      specs.push({ label, spec });
    } catch (error) {
      logger.warn(`content/specs/${file} could not be parsed — skipping (${String(error)})`);
    }
  }

  let activeSpec: string | null = null;
  if (specs.length > 0) {
    const labels = specs.map((s) => s.label);
    if (manifest.activeSpec && labels.includes(manifest.activeSpec)) {
      activeSpec = manifest.activeSpec;
    } else {
      if (manifest.activeSpec) {
        logger.warn(
          `content/docs.json activeSpec "${manifest.activeSpec}" matches no spec file — falling back`,
        );
      } else if (specs.length > 1) {
        logger.warn(
          `content/specs has ${specs.length} files and no docs.json activeSpec — publishing "${labels[0]}"`,
        );
      }
      activeSpec = labels[0] ?? null;
    }
    for (const spec of specs) {
      spec.publish = spec.label === activeSpec;
    }
  }

  // --- guides
  const guideDir = join(contentDir, 'guides');
  const guideOrder = manifest.guides ?? [];
  const guides: GuideInput[] = [];

  for (const file of listFiles(guideDir, '.md')) {
    const { data, body } = parseFrontmatter(readFileSync(join(guideDir, file), 'utf8'));
    const slug = readString(data, 'slug') ?? slugify(basename(file, '.md'));
    const manifestIndex = guideOrder.indexOf(slug);
    guides.push({
      slug,
      title: readString(data, 'title') ?? basename(file, '.md'),
      markdown: body,
      published: readBoolean(data, 'published', true),
      // Manifest order wins; then frontmatter `order`; then 1000 (sorts last).
      order:
        manifestIndex >= 0
          ? manifestIndex
          : readNumber(data, 'order', guideOrder.length + 1000),
    });
  }

  // --- changelog
  const changelogDir = join(contentDir, 'changelog');
  const changelog: ChangelogEntryInput[] = [];

  for (const file of listFiles(changelogDir, '.md')) {
    const { data, body } = parseFrontmatter(readFileSync(join(changelogDir, file), 'utf8'));
    const name = basename(file, '.md');
    // `2026-07-30-additive-fields.md` yields both a date and a stable id.
    const fromName = /^(\d{4}-\d{2}-\d{2})(?:[-_](.*))?$/.exec(name);
    const date = readString(data, 'date') ?? fromName?.[1];
    if (!date) {
      logger.warn(
        `content/changelog/${file} has no date (frontmatter \`date:\` or a YYYY-MM-DD filename prefix) — skipping`,
      );
      continue;
    }
    changelog.push({
      id: readString(data, 'id') ?? slugify(name),
      date,
      title: readString(data, 'title') ?? fromName?.[2] ?? name,
      markdown: body,
      published: readBoolean(data, 'published', true),
    });
  }

  return { specs, guides, changelog, activeSpec, found: true };
}

/** Load `contentDir` and write it into an (assumed empty) docs database. */
export function seedFromContent(
  repo: DocsRepository,
  contentDir: string,
  logger = new Logger('SimDocs'),
): SeedResult {
  const content = loadContent(contentDir, logger);
  if (!content.found) {
    logger.log(`no content directory at ${contentDir} — docs start empty`);
    return { ...EMPTY, contentDir };
  }

  for (const spec of content.specs) repo.createSpecVersion(spec);
  for (const guide of content.guides) repo.upsertGuide(guide);
  for (const entry of content.changelog) repo.upsertChangelogEntry(entry);

  const result: SeedResult = {
    specVersions: content.specs.length,
    guides: content.guides.length,
    changelog: content.changelog.length,
    activeSpec: content.activeSpec,
    contentDir,
    found: true,
  };

  logger.log(
    `seeded docs from ${contentDir}: ${result.specVersions} spec version(s) ` +
      `(active "${result.activeSpec ?? 'none'}"), ${result.guides} guide(s), ` +
      `${result.changelog} changelog entr(ies)`,
  );

  return result;
}
