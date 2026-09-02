"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderDocsIndex = renderDocsIndex;
exports.renderGuidePage = renderGuidePage;
exports.renderChangelogPage = renderChangelogPage;
exports.renderNotFoundPage = renderNotFoundPage;
exports.renderReferencePage = renderReferencePage;
const markdown_1 = require("./markdown");
const STYLE = [
    ':root{--accent:%ACCENT%;--fg:#16191d;--muted:#5b6472;--bg:#ffffff;--line:#e4e7ec;--code:#f5f6f8}',
    '@media (prefers-color-scheme:dark){:root{--fg:#e8eaed;--muted:#9aa3b2;--bg:#14171b;--line:#2a2f37;--code:#1c2027}}',
    '*{box-sizing:border-box}',
    'body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
    '.wrap{max-width:52rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}',
    'header.site{border-bottom:1px solid var(--line);padding-bottom:1rem;margin-bottom:2rem}',
    'header.site .title{font-size:.95rem;font-weight:600;letter-spacing:.02em;color:var(--accent);text-decoration:none}',
    'nav.crumbs{margin-top:.5rem;font-size:.85rem;color:var(--muted)}',
    'nav.crumbs a{color:var(--muted);text-decoration:none;margin-right:1rem}',
    'nav.crumbs a:hover{color:var(--accent)}',
    'h1{font-size:1.9rem;line-height:1.2;margin:0 0 1rem}',
    'h2{font-size:1.35rem;margin:2rem 0 .75rem}',
    'h3{font-size:1.1rem;margin:1.5rem 0 .5rem}',
    'a{color:var(--accent)}',
    'code{background:var(--code);padding:.12em .35em;border-radius:4px;font-size:.9em}',
    'pre{background:var(--code);padding:1rem;border-radius:8px;overflow-x:auto}',
    'pre code{background:none;padding:0}',
    'blockquote{margin:1rem 0;padding:.25rem 1rem;border-left:3px solid var(--line);color:var(--muted)}',
    'table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.95rem}',
    'th,td{border:1px solid var(--line);padding:.45rem .6rem;text-align:left}',
    'hr{border:0;border-top:1px solid var(--line);margin:2rem 0}',
    'ul.index{list-style:none;padding:0}',
    'ul.index li{border-bottom:1px solid var(--line);padding:.75rem 0}',
    'ul.index a{font-weight:600;text-decoration:none}',
    '.muted{color:var(--muted)}',
    '.entry{border-bottom:1px solid var(--line);padding-bottom:1.5rem;margin-bottom:1.5rem}',
    '.entry:last-child{border-bottom:0}',
    '.date{font:600 .8rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);letter-spacing:.04em}',
].join('');
function layout(options) {
    const nav = options.nav
        .map((link) => `<a href="${(0, markdown_1.escapeHtml)(link.href)}">${(0, markdown_1.escapeHtml)(link.label)}</a>`)
        .join('');
    return [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8" />',
        '<meta name="viewport" content="width=device-width,initial-scale=1" />',
        `<title>${(0, markdown_1.escapeHtml)(options.pageTitle)} — ${(0, markdown_1.escapeHtml)(options.siteTitle)}</title>`,
        `<style>${STYLE.replace('%ACCENT%', (0, markdown_1.escapeHtml)(options.accent))}</style>`,
        '</head>',
        '<body>',
        '<div class="wrap">',
        '<header class="site">',
        `<a class="title" href="/docs">${(0, markdown_1.escapeHtml)(options.siteTitle)}</a>`,
        nav ? `<nav class="crumbs">${nav}</nav>` : '',
        '</header>',
        '<main>',
        options.content,
        '</main>',
        '</div>',
        '</body>',
        '</html>',
        '',
    ].join('\n');
}
function renderDocsIndex(model) {
    const sections = [`<h1>${(0, markdown_1.escapeHtml)(model.siteTitle)}</h1>`];
    if (model.intro) {
        sections.push((0, markdown_1.renderMarkdown)(model.intro));
    }
    sections.push('<h2>API reference</h2>');
    sections.push(model.activeSpecLabel
        ? `<p><a href="/docs/reference">Browse the API reference</a>. The current OpenAPI document is ` +
            `<a href="/openapi.json">/openapi.json</a> (version <code>${(0, markdown_1.escapeHtml)(model.activeSpecLabel)}</code>).</p>`
        : '<p><a href="/docs/reference">Browse the API reference</a>. The current OpenAPI document is ' +
            '<a href="/openapi.json">/openapi.json</a>.</p>');
    sections.push('<h2>Guides</h2>');
    if (model.guides.length === 0) {
        sections.push('<p class="muted">No guides published yet.</p>');
    }
    else {
        const items = model.guides
            .map((guide) => `<li><a href="/docs/guides/${(0, markdown_1.escapeHtml)(guide.slug)}">${(0, markdown_1.escapeHtml)(guide.title)}</a></li>`)
            .join('\n');
        sections.push(`<ul class="index">\n${items}\n</ul>`);
    }
    if (model.hasChangelog) {
        sections.push('<h2>Changelog</h2>');
        sections.push('<p><a href="/docs/changelog">Recent API changes</a></p>');
    }
    return layout({
        siteTitle: model.siteTitle,
        accent: model.accent,
        pageTitle: 'Documentation',
        nav: [],
        content: sections.join('\n'),
    });
}
function renderGuidePage(model) {
    return layout({
        siteTitle: model.siteTitle,
        accent: model.accent,
        pageTitle: model.guide.title,
        nav: [{ href: '/docs', label: 'Docs' }],
        content: [
            `<h1>${(0, markdown_1.escapeHtml)(model.guide.title)}</h1>`,
            (0, markdown_1.renderMarkdown)(model.guide.markdown),
        ].join('\n'),
    });
}
function renderChangelogPage(model) {
    const body = model.entries.length === 0
        ? '<p class="muted">Nothing published yet.</p>'
        : model.entries
            .map((entry) => [
            '<article class="entry">',
            `<p class="date">${(0, markdown_1.escapeHtml)(entry.date)}</p>`,
            `<h2>${(0, markdown_1.escapeHtml)(entry.title)}</h2>`,
            (0, markdown_1.renderMarkdown)(entry.markdown),
            '</article>',
        ].join('\n'))
            .join('\n');
    return layout({
        siteTitle: model.siteTitle,
        accent: model.accent,
        pageTitle: 'Changelog',
        nav: [{ href: '/docs', label: 'Docs' }],
        content: ['<h1>Changelog</h1>', body].join('\n'),
    });
}
function renderNotFoundPage(siteTitle, accent, what) {
    return layout({
        siteTitle,
        accent,
        pageTitle: 'Not found',
        nav: [{ href: '/docs', label: 'Docs' }],
        content: [
            '<h1>Not found</h1>',
            `<p class="muted">${(0, markdown_1.escapeHtml)(what)}</p>`,
        ].join('\n'),
    });
}
/**
 * Rendered API reference for the active spec. A standalone page, not the
 * prose layout: the reference UI wants the whole viewport. Scalar is loaded
 * from a CDN and reads `/openapi.json` same-origin, so the page shows whatever
 * version is currently published and re-renders when a scenario republishes.
 * The markup is deterministic (no timestamps, no ids), matching the other docs
 * pages, so the platform's page differ sees it change only when the spec does.
 */
function renderReferencePage(model) {
    const title = (0, markdown_1.escapeHtml)(model.siteTitle);
    const accent = (0, markdown_1.escapeHtml)(model.accent);
    const version = model.activeSpecLabel
        ? ` <span class="version">version <code>${(0, markdown_1.escapeHtml)(model.activeSpecLabel)}</code></span>`
        : '';
    return [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8" />',
        '<meta name="viewport" content="width=device-width,initial-scale=1" />',
        `<title>API reference — ${title}</title>`,
        `<style>:root{--accent:${accent};--fg:#16191d;--muted:#5b6472;--bg:#ffffff;--line:#e4e7ec}` +
            '@media (prefers-color-scheme:dark){:root{--fg:#e8eaed;--muted:#9aa3b2;--bg:#14171b;--line:#2a2f37}}' +
            'body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
            'header.site{display:flex;align-items:baseline;gap:1rem;padding:.8rem 1.25rem;border-bottom:1px solid var(--line)}' +
            'header.site .title{font-size:.95rem;font-weight:600;letter-spacing:.02em;color:var(--accent);text-decoration:none}' +
            'header.site nav a{color:var(--muted);text-decoration:none;margin-right:1rem;font-size:.85rem}' +
            'header.site nav a:hover{color:var(--accent)}' +
            'header.site .version{color:var(--muted);font-size:.85rem}' +
            'header.site code{background:transparent;padding:0}</style>',
        '</head>',
        '<body>',
        '<header class="site">',
        `<a class="title" href="/docs">${title}</a>`,
        '<nav><a href="/docs">Docs</a><a href="/docs/changelog">Changelog</a><a href="/openapi.json">openapi.json</a></nav>',
        version,
        '</header>',
        '<script id="api-reference" data-url="/openapi.json"></script>',
        '<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>',
        '</body>',
        '</html>',
        '',
    ].join('\n');
}
