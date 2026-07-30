import { DocsService, type DocsStatus } from './docs.service';
import type { ChangelogEntry, Guide, SpecVersion, SpecVersionSummary } from './docs.types';
/**
 * The docs editor's backend, behind the same bearer token as the rest of the
 * control plane. Registered only when `docs.enabled` is true; a docs-disabled
 * service 404s these paths, which is how the admin SPA decides whether to show
 * the Docs tab.
 *
 * Drafts and unpublished guides ARE visible here — that is the difference
 * between the control plane and the public `/docs` surface.
 */
export declare class DocsControlController {
    private readonly docs;
    constructor(docs: DocsService);
    status(): DocsStatus;
    listSpecVersions(): {
        specVersions: SpecVersionSummary[];
    };
    getSpecVersion(id: string): SpecVersion;
    createSpecVersion(body: unknown): SpecVersion;
    updateSpecVersion(id: string, body: unknown): SpecVersion;
    publishSpecVersion(id: string): SpecVersion;
    deleteSpecVersion(id: string): {
        deleted: string;
    };
    listGuides(): {
        guides: Guide[];
    };
    getGuide(slug: string): Guide;
    upsertGuide(slug: string, body: unknown): Guide;
    createGuide(body: unknown): Guide;
    deleteGuide(slug: string): {
        deleted: string;
    };
    listChangelog(): {
        changelog: ChangelogEntry[];
    };
    createChangelogEntry(body: unknown): ChangelogEntry;
    upsertChangelogEntry(id: string, body: unknown): ChangelogEntry;
    deleteChangelogEntry(id: string): {
        deleted: string;
    };
    /**
     * Render markdown with the *same* renderer the public pages use, so the
     * editor preview cannot drift from what will actually be published.
     */
    preview(body: unknown): {
        html: string;
    };
}
