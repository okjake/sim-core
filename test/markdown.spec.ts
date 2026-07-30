import {
  escapeHtml,
  parseFrontmatter,
  readBoolean,
  readNumber,
  readString,
  renderInline,
  renderMarkdown,
  slugify,
} from '../src';

describe('markdown renderer', () => {
  it('renders headings, paragraphs and horizontal rules', () => {
    expect(renderMarkdown('# Title\n\nSome text.\n\n---\n\n## Next')).toBe(
      ['<h1>Title</h1>', '<p>Some text.</p>', '<hr />', '<h2>Next</h2>'].join('\n'),
    );
  });

  it('joins wrapped lines into a single paragraph', () => {
    expect(renderMarkdown('one\ntwo\nthree')).toBe('<p>one two three</p>');
  });

  it('renders inline emphasis, code and links', () => {
    expect(renderInline('**bold** and *italic* and `code`')).toBe(
      '<strong>bold</strong> and <em>italic</em> and <code>code</code>',
    );
    expect(renderInline('[docs](/docs/guides/x)')).toBe(
      '<a href="/docs/guides/x">docs</a>',
    );
    expect(renderInline('<https://example.com/a>')).toBe(
      '<a href="https://example.com/a">https://example.com/a</a>',
    );
  });

  it('leaves markdown syntax inside code spans alone', () => {
    expect(renderInline('use `**not bold**` here')).toBe(
      'use <code>**not bold**</code> here',
    );
  });

  it('renders unordered, ordered and nested lists', () => {
    expect(renderMarkdown('- a\n- b')).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>');
    expect(renderMarkdown('1. a\n2. b')).toBe('<ol>\n<li>a</li>\n<li>b</li>\n</ol>');
    expect(renderMarkdown('- a\n  - nested\n- b')).toBe(
      ['<ul>', '<li>a</li>', '<ul>', '<li>nested</li>', '</ul>', '<li>b</li>', '</ul>'].join(
        '\n',
      ),
    );
  });

  it('renders fenced code with a language class and no inline processing', () => {
    expect(renderMarkdown('```bash\ncurl -H "A: b" x\n```')).toBe(
      '<pre><code class="language-bash">curl -H &quot;A: b&quot; x</code></pre>',
    );
  });

  it('renders blockquotes and pipe tables', () => {
    expect(renderMarkdown('> quoted')).toBe(
      '<blockquote>\n<p>quoted</p>\n</blockquote>',
    );
    expect(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')).toContain(
      '<th>a</th><th>b</th>',
    );
    expect(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')).toContain(
      '<tr><td>1</td><td>2</td></tr>',
    );
  });

  describe('escaping', () => {
    it('escapes raw HTML rather than passing it through', () => {
      expect(renderMarkdown('<script>alert(1)</script>')).toBe(
        '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
      );
      expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    });

    it('neutralises javascript: and data: link targets', () => {
      expect(renderInline('[x](javascript:alert)')).toBe('<a href="#">x</a>');
      expect(renderInline('[x](data:text/html,hi)')).toBe('<a href="#">x</a>');
      expect(renderInline('[x](https://ok.example)')).toBe(
        '<a href="https://ok.example">x</a>',
      );
    });

    it('does not treat `$&` in a code span as a replacement pattern', () => {
      expect(renderInline('`a $& b`')).toBe('<code>a $&amp; b</code>');
    });
  });

  describe('determinism', () => {
    const sample = [
      '# Heading',
      '',
      'Text with `code`, **bold**, a [link](/docs) and an entity &amp;.',
      '',
      '- one',
      '  - nested',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '> a quote',
      '',
      '```ts',
      'const x: number = 1;',
      '```',
      '',
      '| col | col2 |',
      '|---|---|',
      '| a | b |',
      '',
      '---',
    ].join('\n');

    it('is byte-identical across repeated renders', () => {
      const first = Buffer.from(renderMarkdown(sample), 'utf8');
      for (let i = 0; i < 5; i += 1) {
        expect(Buffer.from(renderMarkdown(sample), 'utf8').equals(first)).toBe(true);
      }
    });

    it('normalises CRLF so line endings cannot change the output', () => {
      expect(renderMarkdown(sample.replace(/\n/g, '\r\n'))).toBe(renderMarkdown(sample));
    });
  });
});

describe('frontmatter', () => {
  it('parses scalars and strips the fence', () => {
    const { data, body } = parseFrontmatter(
      ['---', 'title: Getting started', 'order: 2', 'published: false', '---', '', '# Hi'].join(
        '\n',
      ),
    );
    expect(data).toEqual({ title: 'Getting started', order: 2, published: false });
    expect(body).toBe('# Hi');
  });

  it('unquotes quoted values and keeps colons in them', () => {
    const { data } = parseFrontmatter('---\ntitle: "A: B"\nid: \'x-1\'\n---\nbody');
    expect(data.title).toBe('A: B');
    expect(data.id).toBe('x-1');
  });

  it('treats a document with no frontmatter as all body', () => {
    expect(parseFrontmatter('# Just markdown')).toEqual({
      data: {},
      body: '# Just markdown',
    });
  });

  it('reads typed values with fallbacks', () => {
    const { data } = parseFrontmatter('---\na: 1\nb: true\nc: hello\n---\n');
    expect(readNumber(data, 'a', 9)).toBe(1);
    expect(readNumber(data, 'missing', 9)).toBe(9);
    expect(readBoolean(data, 'b', false)).toBe(true);
    expect(readBoolean(data, 'missing', true)).toBe(true);
    expect(readString(data, 'c')).toBe('hello');
    expect(readString(data, 'missing')).toBeUndefined();
  });
});

describe('slugify', () => {
  it('produces url-safe slugs', () => {
    expect(slugify('Charges Lifecycle')).toBe('charges-lifecycle');
    expect(slugify('  A/B  Testing! ')).toBe('a-b-testing');
  });
});
