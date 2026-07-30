import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

import { normalizeSimCoreConfig } from '../src';
import { DEMO_CONTENT_DIR, createDemoConfig } from '../examples/demo/demo.config';
import { bearer, createHarness, type TestHarness } from './helpers';

const BASELINE_PATHS = ['/widgets', '/widgets/{id}', '/widgets/orders'];
const ADDITIVE_PATHS = [...BASELINE_PATHS, '/widgets/orders/{id}'];

describe('docs engine', () => {
  let harness: TestHarness;

  const server = (): ReturnType<TestHarness['app']['getHttpServer']> =>
    harness.app.getHttpServer();
  const auth = (): string => bearer(harness.token);

  beforeEach(async () => {
    harness = await createHarness({ docs: true });
  });

  afterEach(async () => {
    await harness.close();
  });

  // ------------------------------------------------------------------ seeding

  describe('baseline seeding from content/', () => {
    it('seeds specs, guides and changelog on first boot', () => {
      const status = harness.docs!.status();
      expect(status.enabled).toBe(true);
      expect(status.contentDir).toBe(DEMO_CONTENT_DIR);
      expect(status.counts).toEqual({ specVersions: 2, guides: 3, changelog: 2 });
      expect(status.migrations).toEqual(['0001-docs-engine']);
    });

    it('publishes exactly the spec named by content/docs.json activeSpec', () => {
      const versions = harness.docs!.listSpecVersions();
      expect(versions.map((v) => v.label).sort()).toEqual(['additive', 'baseline']);

      const active = versions.filter((v) => v.active);
      expect(active).toHaveLength(1);
      expect(active[0]?.label).toBe('baseline');
      expect(active[0]?.publishedAt).not.toBeNull();

      const draft = versions.find((v) => v.label === 'additive');
      expect(draft?.active).toBe(false);
      expect(draft?.publishedAt).toBeNull();
    });

    it('honours frontmatter: titles, publish flags and manifest ordering', () => {
      const guides = harness.docs!.listGuides();
      expect(guides.map((g) => g.slug)).toEqual([
        'getting-started',
        'widgets',
        'internal-notes',
      ]);
      expect(guides.map((g) => g.published)).toEqual([true, true, false]);
      expect(guides[0]?.title).toBe('Getting started');
      expect(guides[0]?.markdown.startsWith('---')).toBe(false);
    });

    it('derives changelog dates and ids from frontmatter', () => {
      const entries = harness.docs!.listChangelog();
      expect(entries.map((e) => e.date)).toEqual(['2026-07-15', '2026-07-01']);
      expect(entries.map((e) => e.id)).toEqual([
        '2026-07-15-additive',
        '2026-07-01-baseline',
      ]);
    });

    it('starts empty and serves the config spec when there is no content dir', async () => {
      const empty = await createHarness({
        docs: { contentDir: join(tmpdir(), 'sim-core-does-not-exist') },
      });
      expect(empty.docs!.status().counts).toEqual({
        specVersions: 0,
        guides: 0,
        changelog: 0,
      });
      const res = await request(empty.app.getHttpServer()).get('/openapi.json').expect(200);
      expect(res.body.info.title).toBe('Demo Widgets API');
      expect(Object.keys(res.body.paths)).toEqual(BASELINE_PATHS);
      await empty.close();
    });

    it('does not reseed when the database already has content', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sim-core-docs-'));
      try {
        const first = await createHarness({ docs: { dataDir: dir, databaseFile: 'd.sqlite' } });
        first.docs!.upsertGuide({ slug: 'hand-written', title: 'Hand written', markdown: 'x' });
        await first.close();

        const second = await createHarness({ docs: { dataDir: dir, databaseFile: 'd.sqlite' } });
        // 3 seeded + 1 added, not 6 + 1: seeding is first-boot only.
        expect(second.docs!.listGuides()).toHaveLength(4);
        await second.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // ------------------------------------------------------- draft / publish

  describe('draft and publish lifecycle', () => {
    it('keeps drafts off the public surface until published', async () => {
      const draft = harness.docs!.createSpecVersion({
        label: 'unreleased',
        spec: {
          openapi: '3.1.0',
          info: { title: 'Unreleased', version: '9.9.9' },
          paths: { '/secret': {} },
        },
      });
      expect(draft.publishedAt).toBeNull();
      expect(draft.active).toBe(false);

      const res = await request(server()).get('/openapi.json').expect(200);
      expect(res.body.info.title).toBe('Demo Widgets API');
      expect(res.body.paths['/secret']).toBeUndefined();
    });

    it('serves the newly published version and switches the active flag', async () => {
      const additive = harness
        .docs!.listSpecVersions()
        .find((v) => v.label === 'additive');

      harness.docs!.publishSpecVersion(additive!.id);

      const res = await request(server()).get('/openapi.json').expect(200);
      expect(Object.keys(res.body.paths)).toEqual(ADDITIVE_PATHS);

      const versions = harness.docs!.listSpecVersions();
      expect(versions.filter((v) => v.active).map((v) => v.label)).toEqual(['additive']);
      expect(versions.find((v) => v.label === 'baseline')?.active).toBe(false);
      // The previously active version stays *published* — it is history, not a draft.
      expect(versions.find((v) => v.label === 'baseline')?.publishedAt).not.toBeNull();
    });

    it('never allows two active versions, however many publishes race through', () => {
      const versions = harness.docs!.listSpecVersions();
      for (let i = 0; i < 6; i += 1) {
        const target = versions[i % versions.length];
        harness.docs!.publishSpecVersion(target!.id);
        expect(harness.docs!.listSpecVersions().filter((v) => v.active)).toHaveLength(1);
      }
    });

    it('publishes by label, which is how a preset scenario activates a version', async () => {
      harness.docs!.publishSpecVersionByLabel('additive');
      const res = await request(server()).get('/openapi.json').expect(200);
      expect(Object.keys(res.body.paths)).toEqual(ADDITIVE_PATHS);
      expect(() => harness.docs!.publishSpecVersionByLabel('nope')).toThrow(
        /No spec version labelled/,
      );
    });

    it('refuses to edit a published version', () => {
      const active = harness.docs!.listSpecVersions().find((v) => v.active);
      expect(() =>
        harness.docs!.updateSpecVersion(active!.id, { label: 'renamed' }),
      ).toThrow(/immutable/);
    });

    it('allows editing a draft', () => {
      const draft = harness.docs!.listSpecVersions().find((v) => !v.active);
      const updated = harness.docs!.updateSpecVersion(draft!.id, {
        spec: { openapi: '3.1.0', info: { title: 'Edited', version: '2.0.0' } },
      });
      expect(updated.spec.info.title).toBe('Edited');
    });

    it('refuses to delete the active version', () => {
      const active = harness.docs!.listSpecVersions().find((v) => v.active);
      expect(() => harness.docs!.deleteSpecVersion(active!.id)).toThrow(/active/);
    });

    it('rejects a duplicate label', () => {
      expect(() =>
        harness.docs!.createSpecVersion({
          label: 'baseline',
          spec: { openapi: '3.1.0', info: { title: 'x', version: '1' } },
        }),
      ).toThrow(/already exists/);
    });
  });

  // ----------------------------------------------------------- ETag / 304

  describe('GET /openapi.json conditional requests', () => {
    it('serves a strong content-hash ETag and the publish time as Last-Modified', async () => {
      const active = harness.docs!.listSpecVersions().find((v) => v.active);
      const res = await request(server()).get('/openapi.json').expect(200);

      expect(res.headers.etag).toMatch(/^"[0-9a-f]{32}"$/);
      expect(res.headers['last-modified']).toBe(
        new Date(active!.publishedAt as string).toUTCString(),
      );
    });

    it('derives the ETag from content — same content, same tag across instances', async () => {
      const a = await request(server()).get('/openapi.json').expect(200);
      const other = await createHarness({ docs: true });
      const b = await request(other.app.getHttpServer()).get('/openapi.json').expect(200);
      await other.close();
      expect(a.headers.etag).toBe(b.headers.etag);
    });

    it('returns 304 for a matching If-None-Match', async () => {
      const first = await request(server()).get('/openapi.json').expect(200);
      const res = await request(server())
        .get('/openapi.json')
        .set('if-none-match', first.headers.etag as string)
        .expect(304);
      expect(res.text).toBe('');
      expect(res.headers.etag).toBe(first.headers.etag);
    });

    it('returns 304 for `If-None-Match: *` and for a list containing the tag', async () => {
      const first = await request(server()).get('/openapi.json').expect(200);
      await request(server()).get('/openapi.json').set('if-none-match', '*').expect(304);
      await request(server())
        .get('/openapi.json')
        .set('if-none-match', `"other", ${first.headers.etag as string}`)
        .expect(304);
    });

    it('returns 200 for a stale If-None-Match', async () => {
      await request(server())
        .get('/openapi.json')
        .set('if-none-match', '"0000000000000000000000000000dead"')
        .expect(200);
    });

    it('returns 304 for an If-Modified-Since at or after the publish time', async () => {
      const first = await request(server()).get('/openapi.json').expect(200);
      const lastModified = first.headers['last-modified'] as string;

      await request(server())
        .get('/openapi.json')
        .set('if-modified-since', lastModified)
        .expect(304);

      await request(server())
        .get('/openapi.json')
        .set('if-modified-since', new Date(Date.parse(lastModified) + 60_000).toUTCString())
        .expect(304);
    });

    it('returns 200 for an If-Modified-Since before the publish time', async () => {
      await request(server())
        .get('/openapi.json')
        .set('if-modified-since', new Date(0).toUTCString())
        .expect(200);
    });

    it('lets If-None-Match win when both validators are sent', async () => {
      const first = await request(server()).get('/openapi.json').expect(200);
      // Fresh date, stale tag: the tag decides, so this must be a 200.
      await request(server())
        .get('/openapi.json')
        .set('if-none-match', '"0000000000000000000000000000dead"')
        .set('if-modified-since', first.headers['last-modified'] as string)
        .expect(200);
    });

    it('ignores an unparseable If-Modified-Since rather than 304-ing blindly', async () => {
      await request(server())
        .get('/openapi.json')
        .set('if-modified-since', 'not a date')
        .expect(200);
    });

    it('answers HEAD probes with the validators and no body', async () => {
      const res = await request(server()).head('/openapi.json').expect(200);
      expect(res.headers.etag).toMatch(/^"[0-9a-f]{32}"$/);
      expect(res.headers['last-modified']).toBeDefined();
      expect(res.text).toBeFalsy();
    });

    it('moves both validators when a new version is published', async () => {
      const before = await request(server()).get('/openapi.json').expect(200);

      // Publish times have one-second resolution; without this the assertion
      // that Last-Modified moved would be a coin flip.
      await new Promise((r) => setTimeout(r, 1_100));
      harness.docs!.publishSpecVersionByLabel('additive');

      const after = await request(server()).get('/openapi.json').expect(200);
      expect(after.headers.etag).not.toBe(before.headers.etag);
      expect(Date.parse(after.headers['last-modified'] as string)).toBeGreaterThan(
        Date.parse(before.headers['last-modified'] as string),
      );

      // The old validator must no longer satisfy a conditional request.
      await request(server())
        .get('/openapi.json')
        .set('if-none-match', before.headers.etag as string)
        .expect(200);
    });

    it('strips /__control paths from a published spec version', async () => {
      harness.docs!.createSpecVersion({
        label: 'with-control',
        publish: true,
        spec: {
          openapi: '3.1.0',
          info: { title: 'x', version: '1' },
          paths: { '/public': {}, '/__control/state': {} },
        },
      });
      const res = await request(server()).get('/openapi.json').expect(200);
      expect(Object.keys(res.body.paths)).toEqual(['/public']);
    });
  });

  // -------------------------------------------------------------- rendering

  describe('public docs pages', () => {
    it('renders the index with published guides and a changelog link', async () => {
      const res = await request(server()).get('/docs').expect(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('Demo Widgets Co. developer docs');
      expect(res.text).toContain('/docs/guides/getting-started');
      expect(res.text).toContain('/docs/guides/widgets');
      expect(res.text).toContain('/docs/changelog');
      expect(res.text).toContain('<code>baseline</code>');
    });

    it('hides unpublished guides from the index and 404s their page', async () => {
      const index = await request(server()).get('/docs').expect(200);
      expect(index.text).not.toContain('internal-notes');

      const page = await request(server()).get('/docs/guides/internal-notes').expect(404);
      expect(page.text).toContain('Not found');
    });

    it('renders a guide page from its markdown', async () => {
      const res = await request(server()).get('/docs/guides/getting-started').expect(200);
      expect(res.text).toContain('<h1>Getting started</h1>');
      expect(res.text).toContain('<pre><code class="language-bash">');
      expect(res.text).toContain('<blockquote>');
    });

    it('renders the changelog newest-first', async () => {
      const res = await request(server()).get('/docs/changelog').expect(200);
      const additive = res.text.indexOf('Order lookup endpoint');
      const baseline = res.text.indexOf('Baseline contract published');
      expect(additive).toBeGreaterThan(-1);
      expect(baseline).toBeGreaterThan(additive);
    });

    it('404s an unknown guide slug', async () => {
      await request(server()).get('/docs/guides/nope').expect(404);
    });

    describe('deterministic HTML', () => {
      const pages = ['/docs', '/docs/guides/getting-started', '/docs/changelog'];

      it.each(pages)('renders %s byte-identically on repeat requests', async (path) => {
        const first = await request(server()).get(path).expect(200);
        const bytes = Buffer.from(first.text, 'utf8');
        for (let i = 0; i < 3; i += 1) {
          const next = await request(server()).get(path).expect(200);
          expect(Buffer.from(next.text, 'utf8').equals(bytes)).toBe(true);
        }
      });

      it.each(pages)(
        'renders %s byte-identically from a second, independently seeded service',
        async (path) => {
          const other = await createHarness({ docs: true });
          try {
            const a = await request(server()).get(path).expect(200);
            const b = await request(other.app.getHttpServer()).get(path).expect(200);
            expect(Buffer.from(b.text, 'utf8').equals(Buffer.from(a.text, 'utf8'))).toBe(true);
          } finally {
            await other.close();
          }
        },
      );

      it('contains no timestamp, build hash or database id', async () => {
        for (const path of pages) {
          const res = await request(server()).get(path).expect(200);
          // Row ids are uuids and publish times are ISO-8601 — neither may leak.
          expect(res.text).not.toMatch(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
          );
          expect(res.text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
        }
      });

      it('changes only when the content changes', async () => {
        const before = await request(server()).get('/docs/guides/widgets').expect(200);
        const again = await request(server()).get('/docs/guides/widgets').expect(200);
        expect(again.text).toBe(before.text);

        harness.docs!.upsertGuide({
          slug: 'widgets',
          title: 'Working with widgets',
          markdown: 'Rewritten.',
          published: true,
          order: 1,
        });
        const after = await request(server()).get('/docs/guides/widgets').expect(200);
        expect(after.text).not.toBe(before.text);
      });
    });
  });

  // ------------------------------------------------------------- docs auth

  describe("authMode 'required'", () => {
    it('401s docs routes without the consumer credential and allows them with it', async () => {
      const secured = await createHarness({
        docs: { authMode: 'required' },
        docsAuthCheck: (req) => req.headers['x-demo-key'] === 'let-me-in',
      });
      const app = secured.app.getHttpServer();

      await request(app).get('/docs').expect(401);
      await request(app).get('/docs/changelog').expect(401);
      await request(app).get('/docs/guides/getting-started').expect(401);

      await request(app).get('/docs').set('x-demo-key', 'let-me-in').expect(200);
      await request(app)
        .get('/docs/guides/getting-started')
        .set('x-demo-key', 'let-me-in')
        .expect(200);

      await secured.close();
    });

    it('treats a throwing credential check as a failed check', async () => {
      const secured = await createHarness({
        docs: { authMode: 'required' },
        docsAuthCheck: () => {
          throw new Error('credential store unreachable');
        },
      });
      await request(secured.app.getHttpServer()).get('/docs').expect(401);
      await secured.close();
    });

    it('refuses to boot with authMode required and no check configured', () => {
      // Failing closed at bootstrap beats silently serving credentialed docs.
      const config = createDemoConfig({ docs: { authMode: 'required' } });
      expect(() => normalizeSimCoreConfig(config)).toThrow(/docsAuthCheck/);
    });

    it('leaves /openapi.json and /health public — the platform polls them unauthenticated', async () => {
      const secured = await createHarness({
        docs: { authMode: 'required' },
        docsAuthCheck: (req) => req.headers['x-demo-key'] === 'let-me-in',
      });
      await request(secured.app.getHttpServer()).get('/health').expect(200);
      await request(secured.app.getHttpServer()).get('/openapi.json').expect(200);
      await secured.close();
    });
  });

  // ------------------------------------------------------- control surface

  describe('__control/docs', () => {
    it('requires the bearer token on every route', async () => {
      await request(server()).get('/__control/docs').expect(401);
      await request(server()).get('/__control/docs/spec-versions').expect(401);
      await request(server()).get('/__control/docs/guides').expect(401);
      await request(server()).get('/__control/docs/changelog').expect(401);
      await request(server()).post('/__control/docs/preview').send({ markdown: 'x' }).expect(401);
      await request(server()).post('/__control/reset-docs').expect(401);
      await request(server())
        .get('/__control/docs')
        .set('authorization', 'Bearer wrong-token-entirely')
        .expect(401);
    });

    it('lists drafts as well as published content', async () => {
      const res = await request(server())
        .get('/__control/docs/guides')
        .set('authorization', auth())
        .expect(200);
      expect(res.body.guides.map((g: { slug: string }) => g.slug)).toContain('internal-notes');
    });

    it('creates, edits and publishes a spec version over HTTP', async () => {
      const created = await request(server())
        .post('/__control/docs/spec-versions')
        .set('authorization', auth())
        .send({
          label: 'from-http',
          spec: { openapi: '3.1.0', info: { title: 'HTTP', version: '1' }, paths: { '/x': {} } },
        })
        .expect(201);
      expect(created.body.active).toBe(false);
      expect(created.body.publishedAt).toBeNull();

      await request(server())
        .patch(`/__control/docs/spec-versions/${created.body.id}`)
        .set('authorization', auth())
        .send({ spec: { openapi: '3.1.0', info: { title: 'HTTP v2', version: '2' } } })
        .expect(200);

      await request(server())
        .post(`/__control/docs/spec-versions/${created.body.id}/publish`)
        .set('authorization', auth())
        .expect(201);

      const served = await request(server()).get('/openapi.json').expect(200);
      expect(served.body.info.title).toBe('HTTP v2');
    });

    it('accepts a spec sent as a JSON string and reports parse errors', async () => {
      await request(server())
        .post('/__control/docs/spec-versions')
        .set('authorization', auth())
        .send({
          label: 'as-string',
          spec: JSON.stringify({ openapi: '3.1.0', info: { title: 'S', version: '1' } }),
        })
        .expect(201);

      const bad = await request(server())
        .post('/__control/docs/spec-versions')
        .set('authorization', auth())
        .send({ label: 'broken', spec: '{ "openapi": ' })
        .expect(400);
      expect(bad.body.error).toBe('validation_failed');
      expect(bad.body.errors.spec).toMatch(/not valid JSON/);
    });

    it('rejects a spec that is not an OpenAPI document', async () => {
      const res = await request(server())
        .post('/__control/docs/spec-versions')
        .set('authorization', auth())
        .send({ label: 'not-a-spec', spec: { hello: 'world' } })
        .expect(400);
      expect(res.body.errors.spec).toMatch(/openapi/);
    });

    it('drafts from the active version when no spec is supplied', async () => {
      const res = await request(server())
        .post('/__control/docs/spec-versions')
        .set('authorization', auth())
        .send({ label: 'copy-of-active' })
        .expect(201);
      expect(Object.keys(res.body.spec.paths)).toEqual(BASELINE_PATHS);
    });

    it('upserts and deletes guides', async () => {
      await request(server())
        .put('/__control/docs/guides/new-guide')
        .set('authorization', auth())
        .send({ title: 'New guide', markdown: '# Hello', published: true, order: 5 })
        .expect(200);

      const page = await request(server()).get('/docs/guides/new-guide').expect(200);
      expect(page.text).toContain('<h1>New guide</h1>');

      await request(server())
        .delete('/__control/docs/guides/new-guide')
        .set('authorization', auth())
        .expect(200);
      await request(server()).get('/docs/guides/new-guide').expect(404);
    });

    it('toggling published moves a guide on and off the public surface', async () => {
      await request(server())
        .put('/__control/docs/guides/internal-notes')
        .set('authorization', auth())
        .send({ title: 'Internal notes', markdown: 'now public', published: true })
        .expect(200);
      await request(server()).get('/docs/guides/internal-notes').expect(200);

      await request(server())
        .put('/__control/docs/guides/internal-notes')
        .set('authorization', auth())
        .send({ title: 'Internal notes', markdown: 'now public', published: false })
        .expect(200);
      await request(server()).get('/docs/guides/internal-notes').expect(404);
    });

    it('upserts and deletes changelog entries', async () => {
      await request(server())
        .put('/__control/docs/changelog/2026-08-01-thing')
        .set('authorization', auth())
        .send({ date: '2026-08-01', title: 'A thing', markdown: 'happened', published: true })
        .expect(200);

      const page = await request(server()).get('/docs/changelog').expect(200);
      expect(page.text.indexOf('A thing')).toBeLessThan(page.text.indexOf('Order lookup'));

      await request(server())
        .delete('/__control/docs/changelog/2026-08-01-thing')
        .set('authorization', auth())
        .expect(200);
      await request(server())
        .delete('/__control/docs/changelog/2026-08-01-thing')
        .set('authorization', auth())
        .expect(404);
    });

    it('validates changelog dates', async () => {
      const res = await request(server())
        .post('/__control/docs/changelog')
        .set('authorization', auth())
        .send({ date: '01/08/2026', title: 'x', markdown: 'y' })
        .expect(400);
      expect(res.body.errors.date).toMatch(/YYYY-MM-DD/);
    });

    it('previews markdown with the renderer the public pages use', async () => {
      const res = await request(server())
        .post('/__control/docs/preview')
        .set('authorization', auth())
        .send({ markdown: '# Hi\n\n- a' })
        .expect(200);
      expect(res.body.html).toBe('<h1>Hi</h1>\n<ul>\n<li>a</li>\n</ul>');
    });
  });

  // ---------------------------------------------------------- reset-docs

  describe('POST /__control/reset-docs', () => {
    it('wipes edits and reseeds from content/', async () => {
      harness.docs!.upsertGuide({
        slug: 'scratch',
        title: 'Scratch',
        markdown: 'temp',
        published: true,
      });
      harness.docs!.publishSpecVersionByLabel('additive');
      expect(harness.docs!.listGuides()).toHaveLength(4);

      const res = await request(server())
        .post('/__control/reset-docs')
        .set('authorization', auth())
        .expect(200);

      expect(res.body).toMatchObject({
        specVersions: 2,
        guides: 3,
        changelog: 2,
        activeSpec: 'baseline',
        found: true,
      });

      expect(harness.docs!.listGuides().map((g) => g.slug)).not.toContain('scratch');
      const served = await request(server()).get('/openapi.json').expect(200);
      expect(Object.keys(served.body.paths)).toEqual(BASELINE_PATHS);
    });

    it('is idempotent', async () => {
      for (let i = 0; i < 3; i += 1) {
        await request(server())
          .post('/__control/reset-docs')
          .set('authorization', auth())
          .expect(200);
      }
      expect(harness.docs!.status().counts).toEqual({
        specVersions: 2,
        guides: 3,
        changelog: 2,
      });
      expect(harness.docs!.listSpecVersions().filter((v) => v.active)).toHaveLength(1);
    });

    it('404s on a service with docs disabled', async () => {
      const plain = await createHarness();
      await request(plain.app.getHttpServer())
        .post('/__control/reset-docs')
        .set('authorization', bearer(plain.token))
        .expect(404);
      await plain.close();
    });
  });

  // ------------------------------------------------------------ chaos rules

  describe('chaos exemption', () => {
    it('leaves /docs and /openapi.json alone by default', async () => {
      await harness.control.activateScenario({
        scenario: 'outage',
        params: {},
        ttlSeconds: 30,
      });
      await request(server()).get('/widgets').expect(503);
      await request(server()).get('/docs').expect(200);
      await request(server()).get('/docs/changelog').expect(200);
      await request(server()).get('/openapi.json').expect(200);
      await harness.control.reset();
    });

    it('subjects them to chaos when docsChaosOptIn is set', async () => {
      const opted = await createHarness({ docs: true, docsChaosOptIn: true });
      await opted.control.activateScenario({ scenario: 'outage', params: {}, ttlSeconds: 30 });

      await request(opted.app.getHttpServer()).get('/docs').expect(503);
      await request(opted.app.getHttpServer()).get('/openapi.json').expect(503);
      // The kill switch and health check stay reachable regardless.
      await request(opted.app.getHttpServer()).get('/health').expect(200);
      await request(opted.app.getHttpServer())
        .post('/__control/reset')
        .set('authorization', bearer(opted.token))
        .expect(201);
      await request(opted.app.getHttpServer()).get('/docs').expect(200);

      await opted.close();
    });
  });
});
