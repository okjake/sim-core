import { Logger } from '@nestjs/common';
import type { ChangelogEntryInput, DocsRepository, GuideInput, SpecVersionInput } from './docs.repository';
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
/** `Charges Lifecycle.md` → `charges-lifecycle`. */
export declare function slugify(input: string): string;
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
export declare function loadContent(contentDir: string, logger?: Logger): LoadedContent;
/** Load `contentDir` and write it into an (assumed empty) docs database. */
export declare function seedFromContent(repo: DocsRepository, contentDir: string, logger?: Logger): SeedResult;
