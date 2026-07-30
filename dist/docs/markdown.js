"use strict";
/**
 * A tiny, deterministic Markdown → HTML renderer.
 *
 * sim-core hand-rolls this for the same reason it hand-rolls `params.ts`
 * instead of depending on zod: the requirement is narrow and the guarantee
 * matters more than the feature set.
 *
 * The guarantee: **identical input produces byte-identical output**, forever.
 * No timestamps, no generated ids, no hashes, no random slug suffixes, no
 * dependency whose next minor release quietly reflows whitespace. The platform
 * diffs published docs pages by normalising to text and hashing, so cosmetic
 * churn here would show up as a phantom upstream documentation change.
 *
 * Supported: ATX headings, paragraphs, fenced and indented code, blockquotes,
 * ordered/unordered lists (nested), horizontal rules, pipe tables, and the
 * inline set `code`, `**bold**`, `*italic*`, `[link](href)`, `![img](src)`,
 * autolinked `<https://…>`. Raw HTML in the source is escaped, never passed
 * through — sim content is authored by us, but the editor is exposed over the
 * control plane and this is one less thing to think about.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtml = escapeHtml;
exports.renderInline = renderInline;
exports.renderMarkdown = renderMarkdown;
const ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};
function escapeHtml(input) {
    return input.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}
/** Only http(s), mailto and site-relative targets survive. */
function safeUrl(raw) {
    const url = raw.trim();
    if (/^(https?:\/\/|mailto:|\/|#|\.\/|\.\.\/)/i.test(url)) {
        return escapeHtml(url);
    }
    return '#';
}
/**
 * Inline rendering runs on escaped text, with code spans lifted out first so
 * emphasis/link syntax inside backticks stays literal. Placeholders use a
 * private-use codepoint that cannot appear in escaped HTML.
 */
function renderInline(source) {
    const spans = [];
    let text = source.replace(/(`+)([\s\S]*?)\1/g, (_match, _ticks, code) => {
        const placeholder = `\u{E000}${spans.length}\u{E001}`;
        spans.push({ placeholder, html: `<code>${escapeHtml(code.trim())}</code>` });
        return placeholder;
    });
    text = escapeHtml(text);
    // Images before links — the syntaxes differ only by the leading `!`.
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => `<img src="${safeUrl(src)}" alt="${alt}" />`);
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => `<a href="${safeUrl(href)}">${label}</a>`);
    // Autolinks: `<https://…>` survives escaping as `&lt;https://…&gt;`.
    text = text.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_m, href) => `<a href="${safeUrl(href)}">${href}</a>`);
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    text = text.replace(/(^|[^\w_])_([^_\n]+)_/g, '$1<em>$2</em>');
    for (const span of spans) {
        // Function form: a literal `$&` inside the code span must not be treated
        // as a replacement pattern.
        text = text.replace(span.placeholder, () => span.html);
    }
    return text;
}
// --- block ------------------------------------------------------------------
const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^(```|~~~)\s*([A-Za-z0-9_+-]*)\s*$/;
const HR = /^(?:-{3,}|\*{3,}|_{3,})$/;
const UL_ITEM = /^(\s*)[-*+]\s+(.*)$/;
const OL_ITEM = /^(\s*)(\d+)[.)]\s+(.*)$/;
const TABLE_DIVIDER = /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$/;
function splitRow(line) {
    return line
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map((cell) => cell.trim());
}
/**
 * Render a Markdown document to an HTML fragment.
 *
 * Output is a newline-joined list of block elements with no trailing newline —
 * stable regardless of how the input was line-terminated or indented.
 */
function renderMarkdown(source) {
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    const listStack = [];
    let paragraph = [];
    let quote = [];
    const flushParagraph = () => {
        if (paragraph.length === 0)
            return;
        out.push(`<p>${renderInline(paragraph.join(' ').trim())}</p>`);
        paragraph = [];
    };
    const flushQuote = () => {
        if (quote.length === 0)
            return;
        const inner = renderMarkdown(quote.join('\n'));
        out.push(`<blockquote>\n${inner}\n</blockquote>`);
        quote = [];
    };
    const closeListsTo = (indent) => {
        while (listStack.length > 0 && listStack[listStack.length - 1].indent > indent) {
            out.push(`</${listStack.pop().tag}>`);
        }
    };
    const closeAllLists = () => {
        while (listStack.length > 0) {
            out.push(`</${listStack.pop().tag}>`);
        }
    };
    const flushLoose = () => {
        flushParagraph();
        flushQuote();
        closeAllLists();
    };
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        const trimmed = line.trim();
        // --- fenced code
        const fence = FENCE.exec(trimmed);
        if (fence) {
            flushLoose();
            const marker = fence[1];
            const lang = fence[2] ?? '';
            const body = [];
            index += 1;
            while (index < lines.length && (lines[index] ?? '').trim() !== marker) {
                body.push(lines[index] ?? '');
                index += 1;
            }
            const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
            out.push(`<pre><code${cls}>${escapeHtml(body.join('\n'))}</code></pre>`);
            continue;
        }
        if (trimmed === '') {
            flushParagraph();
            flushQuote();
            continue;
        }
        // --- blockquote
        if (/^>\s?/.test(trimmed)) {
            flushParagraph();
            closeAllLists();
            quote.push(trimmed.replace(/^>\s?/, ''));
            continue;
        }
        flushQuote();
        // --- horizontal rule
        if (HR.test(trimmed)) {
            flushParagraph();
            closeAllLists();
            out.push('<hr />');
            continue;
        }
        // --- heading
        const heading = HEADING.exec(trimmed);
        if (heading) {
            flushParagraph();
            closeAllLists();
            const level = heading[1].length;
            out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
            continue;
        }
        // --- table
        const next = (lines[index + 1] ?? '').trim();
        if (trimmed.includes('|') && next && TABLE_DIVIDER.test(next) && next.includes('-')) {
            flushParagraph();
            closeAllLists();
            const headers = splitRow(trimmed);
            const rows = [];
            index += 2;
            while (index < lines.length && (lines[index] ?? '').trim().includes('|')) {
                rows.push(splitRow((lines[index] ?? '').trim()));
                index += 1;
            }
            index -= 1;
            const head = headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('');
            const body = rows
                .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
                .join('\n');
            out.push(`<table>\n<thead>\n<tr>${head}</tr>\n</thead>\n<tbody>\n${body}\n</tbody>\n</table>`);
            continue;
        }
        // --- lists
        const ul = UL_ITEM.exec(line);
        const ol = ul ? null : OL_ITEM.exec(line);
        if (ul || ol) {
            flushParagraph();
            const indent = ((ul ?? ol)?.[1] ?? '').length;
            const content = (ul ? ul[2] : ol?.[3]) ?? '';
            const tag = ul ? 'ul' : 'ol';
            closeListsTo(indent);
            const top = listStack[listStack.length - 1];
            if (!top || top.indent < indent) {
                listStack.push({ tag, indent });
                out.push(`<${tag}>`);
            }
            else if (top.tag !== tag) {
                out.push(`</${listStack.pop().tag}>`);
                listStack.push({ tag, indent });
                out.push(`<${tag}>`);
            }
            out.push(`<li>${renderInline(content.trim())}</li>`);
            continue;
        }
        // --- paragraph (a plain line inside a list continues that list item's text)
        closeAllLists();
        paragraph.push(trimmed);
    }
    flushLoose();
    return out.join('\n');
}
