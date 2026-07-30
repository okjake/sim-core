import type { OpenApiDocument } from '../config';
export interface CreateSpecVersionBody {
    label: string;
    /** Omitted together with `fromActive` means "copy the active spec". */
    spec?: OpenApiDocument;
    fromActive?: boolean;
    publish?: boolean;
}
export declare function parseCreateSpecVersionBody(body: unknown): CreateSpecVersionBody;
export interface UpdateSpecVersionBody {
    label?: string;
    spec?: OpenApiDocument;
}
export declare function parseUpdateSpecVersionBody(body: unknown): UpdateSpecVersionBody;
export interface GuideBody {
    slug: string;
    title: string;
    markdown: string;
    published: boolean;
    order?: number;
}
export declare function parseGuideBody(body: unknown, slugFromPath?: string): GuideBody;
export interface ChangelogBody {
    id?: string;
    date: string;
    title: string;
    markdown: string;
    published: boolean;
}
export declare function parseChangelogBody(body: unknown, idFromPath?: string): ChangelogBody;
export declare function parsePreviewBody(body: unknown): string;
