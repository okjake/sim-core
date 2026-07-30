import { useCallback, useEffect, useState, type ReactElement } from 'react';

import {
  ApiError,
  api,
  type ChangelogEntry,
  type DocsStatus,
  type Guide,
  type SpecVersion,
  type SpecVersionSummary,
} from './api';

type Section = 'specs' | 'guides' | 'changelog';

const message = (err: unknown): string =>
  err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);

/** `2026-07-30`, for a new changelog entry's default date. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- spec versions ----------------------------------------------------------

function SpecVersions({
  token,
  onChanged,
}: {
  token: string;
  onChanged: () => void;
}): ReactElement {
  const [versions, setVersions] = useState<SpecVersionSummary[]>([]);
  const [selected, setSelected] = useState<SpecVersion | null>(null);
  const [draft, setDraft] = useState('');
  const [label, setLabel] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setVersions(await api.docs.specVersions(token));
      setError(null);
    } catch (err) {
      setError(message(err));
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = async (id: string): Promise<void> => {
    try {
      const version = await api.docs.specVersion(token, id);
      setSelected(version);
      setDraft(JSON.stringify(version.spec, null, 2));
      setParseError(null);
      setError(null);
    } catch (err) {
      setError(message(err));
    }
  };

  /** Parse on every keystroke — the whole point of a raw JSON textarea. */
  const onDraftChange = (value: string): void => {
    setDraft(value);
    if (value.trim() === '') {
      setParseError('empty');
      return;
    }
    try {
      JSON.parse(value);
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'invalid JSON');
    }
  };

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      onChanged();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const createDraft = (fromActive: boolean): void => {
    const nextLabel = window.prompt('Label for the new draft (e.g. 2026-08-breaking)');
    if (!nextLabel) return;
    void run(async () => {
      const created = await api.docs.createSpecVersion(token, {
        label: nextLabel,
        ...(fromActive
          ? { fromActive: true }
          : {
              spec: JSON.stringify(
                { openapi: '3.1.0', info: { title: nextLabel, version: '1.0.0' }, paths: {} },
                null,
                2,
              ),
            }),
      });
      await open(created.id);
    });
  };

  const isDraft = selected !== null && selected.publishedAt === null;

  return (
    <div className="docs-split">
      <div className="docs-list">
        <div className="row tight">
          <button className="ghost" type="button" onClick={() => createDraft(true)}>
            Draft from active
          </button>
          <button className="ghost" type="button" onClick={() => createDraft(false)}>
            Draft from scratch
          </button>
        </div>
        <ul className="index">
          {versions.length === 0 ? <li className="hint">No spec versions.</li> : null}
          {versions.map((version) => (
            <li key={version.id} className={selected?.id === version.id ? 'sel' : ''}>
              <button type="button" className="link" onClick={() => void open(version.id)}>
                {version.label}
              </button>
              {version.active ? <span className="pill ok">active</span> : null}
              {version.publishedAt === null ? (
                <span className="pill">draft</span>
              ) : !version.active ? (
                <span className="pill muted-pill">published</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="docs-editor">
        {!selected ? (
          <p className="hint">Select a spec version to view or edit it.</p>
        ) : (
          <>
            <div className="row tight">
              <div className="field grow">
                <label htmlFor="spec-label">label</label>
                <input
                  id="spec-label"
                  value={label || selected.label}
                  disabled={!isDraft}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <button
                className="primary"
                type="button"
                disabled={busy || !isDraft || parseError !== null}
                onClick={() =>
                  void run(() =>
                    api.docs.updateSpecVersion(token, selected.id, {
                      label: label || selected.label,
                      spec: draft,
                    }),
                  )
                }
              >
                Save draft
              </button>
              <button
                className="primary"
                type="button"
                disabled={busy || selected.active}
                onClick={() => void run(() => api.docs.publishSpecVersion(token, selected.id))}
              >
                Publish
              </button>
              <button
                className="ghost"
                type="button"
                disabled={busy || selected.active}
                onClick={() =>
                  void run(async () => {
                    await api.docs.deleteSpecVersion(token, selected.id);
                    setSelected(null);
                  })
                }
              >
                Delete
              </button>
            </div>

            {!isDraft ? (
              <p className="hint">
                Published versions are immutable history. Create a draft from this one to change
                it.
              </p>
            ) : null}

            <textarea
              className="code"
              spellCheck={false}
              rows={22}
              value={draft}
              readOnly={!isDraft}
              onChange={(e) => onDraftChange(e.target.value)}
            />
            {parseError ? (
              <p className="error">JSON: {parseError}</p>
            ) : (
              <p className="hint">JSON parses.</p>
            )}
          </>
        )}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}

// --- markdown editors -------------------------------------------------------

interface MarkdownDoc {
  key: string;
  title: string;
  markdown: string;
  published: boolean;
  /** Guides only. */
  order?: number;
  /** Changelog only. */
  date?: string;
}

function MarkdownEditor({
  token,
  kind,
  docs,
  onSave,
  onDelete,
  onChanged,
}: {
  token: string;
  kind: 'guide' | 'changelog';
  docs: MarkdownDoc[];
  onSave: (doc: MarkdownDoc) => Promise<unknown>;
  onDelete: (key: string) => Promise<unknown>;
  onChanged: () => void;
}): ReactElement {
  const [current, setCurrent] = useState<MarkdownDoc | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const create = (): void => {
    const key = window.prompt(
      kind === 'guide' ? 'Slug for the new guide' : 'Id for the new changelog entry',
    );
    if (!key) return;
    setCurrent({
      key,
      title: '',
      markdown: '',
      published: false,
      ...(kind === 'guide' ? { order: docs.length } : { date: today() }),
    });
    setPreview(null);
  };

  return (
    <div className="docs-split">
      <div className="docs-list">
        <div className="row tight">
          <button className="ghost" type="button" onClick={create}>
            New {kind === 'guide' ? 'guide' : 'entry'}
          </button>
        </div>
        <ul className="index">
          {docs.length === 0 ? <li className="hint">Nothing yet.</li> : null}
          {docs.map((doc) => (
            <li key={doc.key} className={current?.key === doc.key ? 'sel' : ''}>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setCurrent(doc);
                  setPreview(null);
                }}
              >
                {doc.title || doc.key}
              </button>
              <span className={`pill ${doc.published ? 'ok' : ''}`}>
                {doc.published ? 'published' : 'draft'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="docs-editor">
        {!current ? (
          <p className="hint">Select something to edit, or create one.</p>
        ) : (
          <>
            <div className="row tight">
              <div className="field grow">
                <label htmlFor="md-title">title</label>
                <input
                  id="md-title"
                  value={current.title}
                  onChange={(e) => setCurrent({ ...current, title: e.target.value })}
                />
              </div>
              {kind === 'changelog' ? (
                <div className="field">
                  <label htmlFor="md-date">date</label>
                  <input
                    id="md-date"
                    type="date"
                    value={current.date ?? today()}
                    onChange={(e) => setCurrent({ ...current, date: e.target.value })}
                  />
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="md-order">order</label>
                  <input
                    id="md-order"
                    type="number"
                    value={current.order ?? 0}
                    onChange={(e) => setCurrent({ ...current, order: Number(e.target.value) })}
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="md-pub">published</label>
                <input
                  id="md-pub"
                  type="checkbox"
                  checked={current.published}
                  onChange={(e) => setCurrent({ ...current, published: e.target.checked })}
                />
              </div>
            </div>

            <textarea
              className="code"
              spellCheck={false}
              rows={18}
              value={current.markdown}
              onChange={(e) => setCurrent({ ...current, markdown: e.target.value })}
            />

            <div className="row tight">
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => void run(() => onSave(current))}
              >
                Save
              </button>
              <button
                className="ghost"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const { html } = await api.docs.preview(token, current.markdown);
                    setPreview(html);
                  })
                }
              >
                Preview
              </button>
              <button
                className="ghost"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onDelete(current.key);
                    setCurrent(null);
                    setPreview(null);
                  })
                }
              >
                Delete
              </button>
            </div>

            {preview !== null ? (
              <div className="preview">
                <h3>Preview</h3>
                {/* Rendered by the same server-side renderer the public pages
                    use, so what is shown here is what will be published. */}
                <div dangerouslySetInnerHTML={{ __html: preview }} />
              </div>
            ) : null}
          </>
        )}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}

// --- panel ------------------------------------------------------------------

export default function DocsPanel({ token }: { token: string }): ReactElement {
  const [section, setSection] = useState<Section>('specs');
  const [status, setStatus] = useState<DocsStatus | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextGuides, nextChangelog] = await Promise.all([
        api.docs.status(token),
        api.docs.guides(token),
        api.docs.changelog(token),
      ]);
      setStatus(nextStatus);
      setGuides(nextGuides);
      setChangelog(nextChangelog);
      setError(null);
    } catch (err) {
      setError(message(err));
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resetDocs = async (): Promise<void> => {
    if (
      !window.confirm(
        'Wipe every spec version, guide and changelog entry and reseed from the ' +
          "service's content/ directory? Unsaved editor work is lost.",
      )
    ) {
      return;
    }
    try {
      const result = await api.docs.resetDocs(token);
      setNotice(
        `Reseeded from ${result.contentDir}: ${result.specVersions} spec version(s), ` +
          `${result.guides} guide(s), ${result.changelog} changelog entr(ies).`,
      );
      await refresh();
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <div className="panel wide">
      <div className="row between">
        <h2>Docs</h2>
        <div className="row tight">
          <a className="ghost as-button" href="/docs" target="_blank" rel="noreferrer">
            View public docs
          </a>
          <button className="ghost" type="button" onClick={() => void resetDocs()}>
            Reset from content/
          </button>
        </div>
      </div>

      {status ? (
        <p className="hint">
          {status.counts.specVersions} spec version(s) &middot; {status.counts.guides} guide(s)
          &middot; {status.counts.changelog} changelog entr(ies) &middot; active spec{' '}
          <code>{status.activeSpec?.label ?? 'none (serving config.openapi)'}</code> &middot; auth{' '}
          <code>{status.authMode}</code>
        </p>
      ) : null}

      <div className="tabs sub">
        {(['specs', 'guides', 'changelog'] as Section[]).map((id) => (
          <button
            key={id}
            type="button"
            className={section === id ? 'tab active' : 'tab'}
            onClick={() => setSection(id)}
          >
            {id === 'specs' ? 'Spec versions' : id === 'guides' ? 'Guides' : 'Changelog'}
          </button>
        ))}
      </div>

      {notice ? <p className="hint">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {section === 'specs' ? <SpecVersions token={token} onChanged={() => void refresh()} /> : null}

      {section === 'guides' ? (
        <MarkdownEditor
          token={token}
          kind="guide"
          docs={guides.map((g) => ({
            key: g.slug,
            title: g.title,
            markdown: g.markdown,
            published: g.published,
            order: g.order,
          }))}
          onSave={(doc) =>
            api.docs.saveGuide(token, doc.key, {
              title: doc.title,
              markdown: doc.markdown,
              published: doc.published,
              order: doc.order,
            })
          }
          onDelete={(slug) => api.docs.deleteGuide(token, slug)}
          onChanged={() => void refresh()}
        />
      ) : null}

      {section === 'changelog' ? (
        <MarkdownEditor
          token={token}
          kind="changelog"
          docs={changelog.map((c) => ({
            key: c.id,
            title: c.title,
            markdown: c.markdown,
            published: c.published,
            date: c.date,
          }))}
          onSave={(doc) =>
            api.docs.saveChangelogEntry(token, doc.key, {
              date: doc.date ?? today(),
              title: doc.title,
              markdown: doc.markdown,
              published: doc.published,
            })
          }
          onDelete={(id) => api.docs.deleteChangelogEntry(token, id)}
          onChanged={() => void refresh()}
        />
      ) : null}
    </div>
  );
}
