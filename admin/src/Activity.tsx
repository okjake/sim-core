import { useState, type ReactElement } from 'react';

import type { RecordedWebhook, RequestTailEntry } from './api';
import { isOperatorTraffic } from './format';

const SHOW_OPERATOR_KEY = 'sim-core.activity.show-operator';

function statusClass(status: number): string {
  if (status >= 500) return 's5';
  if (status >= 400) return 's4';
  return 's2';
}

/** Local wall-clock time, matching the status header's "reverts at". */
function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * What came in: the request tail (this service's inbound requests) and the
 * platform webhooks it received. Admin/control traffic is hidden by default —
 * the page polling itself every five seconds otherwise drowns everything else.
 */
export default function Activity({
  tail,
  webhooks,
  sendsTraffic,
  capacity,
}: {
  capacity: number;
  tail: RequestTailEntry[];
  webhooks: RecordedWebhook[] | null;
  sendsTraffic: boolean;
}): ReactElement {
  const [view, setView] = useState<'requests' | 'webhooks'>('requests');
  const [showOperator, setShowOperator] = useState(() => readFlag(SHOW_OPERATOR_KEY));

  const visible = showOperator ? tail : tail.filter((entry) => !isOperatorTraffic(entry.path));
  const hidden = tail.length - visible.length;

  return (
    <section className="section" aria-labelledby="activity-h">
      <div className="section-head row-between">
        <h2 id="activity-h">Activity</h2>
        <div className="segmented small" role="group" aria-label="Activity view">
          <button
            type="button"
            aria-pressed={view === 'requests'}
            className={view === 'requests' ? 'seg is-on' : 'seg'}
            onClick={() => setView('requests')}
          >
            Requests received
          </button>
          <button
            type="button"
            aria-pressed={view === 'webhooks'}
            className={view === 'webhooks' ? 'seg is-on' : 'seg'}
            onClick={() => setView('webhooks')}
          >
            Webhooks received{webhooks && webhooks.length > 0 ? ` (${webhooks.length})` : ''}
          </button>
        </div>
      </div>

      {view === 'requests' ? (
        <>
          <div className="activity-bar">
            <p className="hint">
              Newest first. This service keeps its last {capacity} requests in memory.
              {sendsTraffic ? ' Traffic this sim sends is counted under Status, not here.' : ''}
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={showOperator}
                onChange={(e) => {
                  setShowOperator(e.target.checked);
                  try {
                    localStorage.setItem(SHOW_OPERATOR_KEY, e.target.checked ? '1' : '0');
                  } catch {
                    /* per-viewer preference only */
                  }
                }}
              />
              Show admin and health checks{!showOperator && hidden > 0 ? ` (${hidden} hidden)` : ''}
            </label>
          </div>
          <div className="table-wrap">
            <table className="tail">
              <thead>
                <tr>
                  <th className="c-time">Time</th>
                  <th className="c-method">Method</th>
                  <th>Path</th>
                  <th className="c-status num">Status</th>
                  <th className="c-latency num">Latency</th>
                  <th className="c-chaos">Fault</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      {tail.length === 0
                        ? 'No requests yet. They appear here as soon as anything calls this service.'
                        : 'Only admin and health-check requests so far. Tick the box above to see them.'}
                    </td>
                  </tr>
                ) : null}
                {visible.map((entry) => (
                  <tr key={entry.seq}>
                    <td className="mono c-time" title={entry.at}>
                      {localTime(entry.at)}
                    </td>
                    <td className="mono c-method">{entry.method}</td>
                    <td className="mono c-path" title={entry.path}>
                      {entry.path}
                      {entry.chaos?.length ? (
                        <span className="fault-inline">{entry.chaos.join(', ')}</span>
                      ) : null}
                    </td>
                    <td className={`mono num c-status ${statusClass(entry.status)}`}>{entry.status}</td>
                    <td className="mono num c-latency">{entry.latencyMs}ms</td>
                    <td className="mono c-chaos">{entry.chaos?.join(', ') ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Webhooks webhooks={webhooks} />
      )}
    </section>
  );
}

function Webhooks({ webhooks }: { webhooks: RecordedWebhook[] | null }): ReactElement {
  if (webhooks === null) {
    return <p className="hint">Couldn’t load received webhooks from this service.</p>;
  }
  if (webhooks.length === 0) {
    return (
      <p className="empty-block">
        No webhooks received since this service started. Deliveries from Partner API, accepted or
        rejected, are listed here.
      </p>
    );
  }
  return (
    <ul className="webhooks">
      {webhooks.map((hook) => (
        <li key={hook.seq}>
          <details>
            <summary>
              <span className="mono" title={hook.at}>
                {localTime(hook.at)}
              </span>
              <span className="hook-event">{hook.event ?? 'unknown event'}</span>
              <span className={`tag ${hook.verified ? 'ok' : 'err'}`}>
                {hook.verified ? 'signature ok' : 'rejected'}
              </span>
              <span className={`mono ${statusClass(hook.status)}`}>{hook.status}</span>
              <span className="mono hook-path">{hook.path}</span>
            </summary>
            <pre>{JSON.stringify(hook.body, null, 2)}</pre>
          </details>
        </li>
      ))}
    </ul>
  );
}
