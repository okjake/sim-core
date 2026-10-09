import { useState, type ReactElement } from 'react';

import { api, type ControlState, type SeedResult } from './api';
import { useConfirm } from './confirm';
import { errorMessage } from './format';

/**
 * Everything the old Live state / Traffic driver panels showed, plus the raw
 * state document, out of the way until someone is debugging the sim itself.
 */
export function Advanced({ state }: { state: ControlState }): ReactElement {
  const driver = state.driver;
  const flows = Object.entries(driver.flows ?? {});
  return (
    <details className="section advanced">
      <summary>
        <h2>Advanced</h2>
        <span className="section-sub">Raw state, fault rules and driver counters</span>
      </summary>
      <div className="advanced-grid">
        <dl className="kv">
          <dt>Baseline</dt>
          <dd>
            fault rules {state.baseline.chaos ? 'clear' : 'active'} · traffic{' '}
            {state.baseline.driver ? 'normal' : 'changed'}
          </dd>
          <dt>Active scenario</dt>
          <dd className="mono">{state.scenario ? state.scenario.id : 'none'}</dd>
          {state.scenario ? (
            <>
              <dt>Scenario params</dt>
              <dd className="mono">{JSON.stringify(state.scenario.params)}</dd>
              <dt>Expires at</dt>
              <dd className="mono">{state.scenario.expiresAt}</dd>
            </>
          ) : null}
          <dt>Fault rules</dt>
          <dd className="mono">{state.chaos.rules.length}</dd>
          <dt>Request tail</dt>
          <dd className="mono">
            {state.requestTail.size} / {state.requestTail.capacity}
          </dd>
          <dt>Started</dt>
          <dd className="mono">{state.service.startedAt}</dd>
          {driver.configured ? (
            <>
              <dt>Traffic rate (effective / baseline / cap)</dt>
              <dd className="mono">
                {driver.effectiveRequestsPerMinute} / {driver.baselineRequestsPerMinute} /{' '}
                {driver.maxRequestsPerMinute} per min
              </dd>
              <dt>Total sent / failed</dt>
              <dd className="mono">
                {driver.totalRequests} / {driver.totalFailures}
              </dd>
              <dt>Cap hits</dt>
              <dd className="mono">{driver.capHits}</dd>
              {driver.emptySteps !== undefined ? (
                <>
                  <dt>Empty flow steps</dt>
                  <dd className="mono">{driver.emptySteps}</dd>
                </>
              ) : null}
              <dt>Request mutators</dt>
              <dd className="mono">{driver.requestMutators ?? 0}</dd>
              <dt>Current flow</dt>
              <dd className="mono">{driver.currentFlow ?? 'idle'}</dd>
              {driver.override ? (
                <>
                  <dt>Override expires in</dt>
                  <dd className="mono">{driver.override.remainingSeconds}s</dd>
                </>
              ) : null}
            </>
          ) : null}
        </dl>

        {flows.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Flow</th>
                  <th className="num">Runs</th>
                  <th className="num">Requests</th>
                  <th className="num">Failures</th>
                </tr>
              </thead>
              <tbody>
                {flows.map(([id, stats]) => (
                  <tr key={id}>
                    <td className="mono">{id}</td>
                    <td className="mono num">{stats.runs}</td>
                    <td className="mono num">{stats.requests}</td>
                    <td className="mono num">{stats.failures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {state.chaos.rules.length > 0 ? (
        <>
          <h3>Fault rules</h3>
          <pre className="raw">{JSON.stringify(state.chaos.rules, null, 2)}</pre>
        </>
      ) : null}
      <details className="raw-toggle">
        <summary>Full state JSON</summary>
        <pre className="raw">{JSON.stringify(state, null, 2)}</pre>
      </details>
    </details>
  );
}

/**
 * Actions that throw work away. Only rendered when there is one to offer —
 * today that is the docs reseed, which is also the undo for a published spec.
 */
export function DangerZone({
  token,
  docsEnabled,
  onChanged,
}: {
  token: string;
  docsEnabled: boolean;
  onChanged: () => void;
}): ReactElement | null {
  const confirm = useConfirm();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!docsEnabled) return null;

  const resetDocs = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Reset docs from content/?',
      body: (
        <>
          <p>
            Deletes every spec version, guide and changelog entry in this sim’s docs database and
            reseeds them from its checked-in <code>content/</code> directory.
          </p>
          <p>
            The active spec goes back to the checked-in one, which undoes any published spec
            version. Partner API’s spec monitor sees that as another contract change.
          </p>
        </>
      ),
      confirmLabel: 'Reset docs',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const result: SeedResult = await api.docs.resetDocs(token);
      setNotice(
        `Reseeded: ${result.specVersions} spec version(s), ${result.guides} guide(s), ` +
          `${result.changelog} changelog entr(ies). Active spec: ${result.activeSpec ?? 'none'}.`,
      );
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section danger-zone" aria-labelledby="danger-h">
      <div className="section-head">
        <h2 id="danger-h">Danger zone</h2>
      </div>
      <div className="danger-item">
        <div>
          <h3>Reset docs from content/</h3>
          <p className="control-desc">
            Throws away docs edits and published spec versions. This is the undo for a permanent spec
            publish.
          </p>
        </div>
        <button type="button" className="danger" disabled={busy} onClick={() => void resetDocs()}>
          {busy ? 'Resetting…' : 'Reset docs…'}
        </button>
      </div>
      {notice ? <p className="hint">{notice}</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
