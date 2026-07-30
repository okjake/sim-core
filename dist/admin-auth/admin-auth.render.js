"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderAccessDeniedPage = renderAccessDeniedPage;
exports.renderSignedOutPage = renderSignedOutPage;
const markdown_1 = require("../docs/markdown");
/**
 * The two pages the gate can render.
 *
 * Same determinism contract as `docs.render.ts` — no clock, no random ids, no
 * build hashes — for the same reason plus one more: these pages are the only
 * thing a rejected visitor sees, and a page that varies per render is a page
 * that can leak *when* and *how often* something was attempted.
 *
 * They also say nothing about **why** access was denied. Wrong Workspace
 * domain, unverified address, not on the allowlist, forged token — all produce
 * this identical body. Telling a prober which check they failed is telling them
 * which check to attack next.
 */
const STYLE = [
    ':root{--accent:%ACCENT%;--fg:#16191d;--muted:#5b6472;--bg:#ffffff;--line:#e4e7ec}',
    '@media (prefers-color-scheme:dark){:root{--fg:#e8eaed;--muted:#9aa3b2;--bg:#14171b;--line:#2a2f37}}',
    '*{box-sizing:border-box}',
    'body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
    '.wrap{max-width:34rem;margin:0 auto;padding:6rem 1.25rem 4rem}',
    '.dot{display:inline-block;width:.6rem;height:.6rem;border-radius:50%;background:var(--accent);margin-right:.5rem;vertical-align:middle}',
    '.eyebrow{font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 .75rem}',
    'h1{font-size:1.6rem;line-height:1.25;margin:0 0 1rem}',
    'p{margin:0 0 1rem;color:var(--muted)}',
    'p.lede{color:var(--fg)}',
    'code{font:.9em/1 ui-monospace,SFMono-Regular,Menlo,monospace}',
    'a.action{display:inline-block;margin-top:.5rem;padding:.55rem 1rem;border:1px solid var(--line);border-radius:8px;color:var(--accent);text-decoration:none;font-weight:600;font-size:.95rem}',
    'a.action:hover{border-color:var(--accent)}',
    'footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.85rem;color:var(--muted)}',
].join('');
function layout(options) {
    return [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8" />',
        '<meta name="viewport" content="width=device-width,initial-scale=1" />',
        '<meta name="robots" content="noindex" />',
        `<title>${(0, markdown_1.escapeHtml)(options.pageTitle)} — ${(0, markdown_1.escapeHtml)(options.serviceTitle)}</title>`,
        `<style>${STYLE.replace('%ACCENT%', (0, markdown_1.escapeHtml)(options.accent))}</style>`,
        '</head>',
        '<body>',
        '<div class="wrap">',
        `<p class="eyebrow"><span class="dot"></span>${(0, markdown_1.escapeHtml)(options.serviceTitle)} admin</p>`,
        options.content,
        '<footer>This is synthetic test infrastructure operated by the partner-api team.</footer>',
        '</div>',
        '</body>',
        '</html>',
        '',
    ].join('\n');
}
/** 403 body. Identical for every failure reason, on purpose. */
function renderAccessDeniedPage(model) {
    return layout({
        serviceTitle: model.serviceTitle,
        accent: model.accent,
        pageTitle: 'Access denied',
        content: [
            '<h1>Access denied</h1>',
            `<p class="lede">This admin console is restricted to signed-in <code>@${(0, markdown_1.escapeHtml)(model.allowedDomain)}</code> accounts.</p>`,
            '<p>If you have more than one Google account, sign out of the others first, or use a separate browser profile.</p>',
            '<a class="action" href="/admin">Try again</a>',
        ].join('\n'),
    });
}
/** Shown after `GET /admin/auth/logout`, once the cookie has been cleared. */
function renderSignedOutPage(model) {
    return layout({
        serviceTitle: model.serviceTitle,
        accent: model.accent,
        pageTitle: 'Signed out',
        content: [
            '<h1>Signed out</h1>',
            '<p class="lede">Your admin session for this service has been cleared.</p>',
            '<p>Your Google session itself is untouched — signing in again will not prompt for a password unless Google decides it should.</p>',
            '<a class="action" href="/admin">Sign in again</a>',
        ].join('\n'),
    });
}
