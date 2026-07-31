import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react';

import DocsPanel from './DocsPanel';
import {
  ApiError,
  api,
  type Brand,
  type ControlState,
  type ParamDescription,
  type RequestTailEntry,
  type ScenarioListing,
} from './api';

const TOKEN_KEY = 'sim-core.control-token';
const POLL_MS = 5_000;
/**
 * Marks that a `/__control` 401 has already been answered with one full
 * re-authentication this tab. `sessionStorage`, not a ref, because the
 * recovery is a page navigation — anything in memory is gone by the time the
 * question is asked again.
 */
const RECOVERY_KEY = 'sim-core.session-recovery-attempted';

type Tab = 'control' | 'docs';

function useBrand(): Brand | null {
  const [brand, setBrand] = useState<Brand | null>(null);
  useEffect(() => {
    api.brand().then(setBrand).catch(() => undefined);
  }, []);
  return brand;
}

function TokenGate({ onSubmit }: { onSubmit: (token: string) => void }): ReactElement {
  const [value, setValue] = useState('');
  return (
    <form
      className="panel gate"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <h2>Control token</h2>
      <p>
        Paste this service&rsquo;s <code>CONTROL_TOKEN</code>. It is kept in this
        browser&rsquo;s localStorage and sent as a bearer token to <code>/__control</code>.
      </p>
      <label htmlFor="token">Token</label>
      <input
        id="token"
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="•••••••••••••••••"
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" type="submit" disabled={!value.trim()}>
          Unlock
        </button>
      </div>
    </form>
  );
}

function statusClass(status: number): string {
  if (status >= 500) return 's5';
  if (status >= 400) return 's4';
  return 's2';
}

function defaultsFor(params: ParamDescription | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, field] of Object.entries(params?.fields ?? {})) {
    out[key] = field.default === undefined ? '' : String(field.default);
  }
  return out;
}

function ScenarioPanel({
  token,
  scenarios,
  onChanged,
}: {
  token: string;
  scenarios: ScenarioListing[];
  onChanged: () => void;
}): ReactElement {
  const [selected, setSelected] = useState('');
  const [ttl, setTtl] = useState('300');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = useMemo(
    () => scenarios.find((s) => s.id === selected) ?? scenarios[0],
    [scenarios, selected],
  );

  useEffect(() => {
    if (!selected && scenarios[0]) setSelected(scenarios[0].id);
  }, [scenarios, selected]);

  useEffect(() => {
    setValues(defaultsFor(current?.params ?? null));
  }, [current?.id]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const params: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(current.params?.fields ?? {})) {
        const raw = values[key];
        if (raw === undefined || raw === '') continue;
        params[key] = field.type === 'number' ? Number(raw) : raw;
      }
      await api.activate(token, {
        scenario: current.id,
        params,
        ttlSeconds: Number(ttl),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Activate scenario</h2>
      <label htmlFor="scenario">Scenario</label>
      <select id="scenario" value={current?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id}
          </option>
        ))}
      </select>
      <p className="hint">{current?.description}</p>

      <div className="row" style={{ marginTop: 12 }}>
        {Object.entries(current?.params?.fields ?? {}).map(([key, field]) => (
          <div className="field" key={key}>
            <label htmlFor={`p-${key}`} title={field.description}>
              {key}
            </label>
            {field.values ? (
              <select
                id={`p-${key}`}
                value={values[key] ?? ''}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              >
                {field.values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`p-${key}`}
                type={field.type === 'number' ? 'number' : 'text'}
                value={values[key] ?? ''}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            )}
          </div>
        ))}
        <div className="field">
          <label htmlFor="ttl">ttlSeconds *</label>
          <input
            id="ttl"
            type="number"
            min={1}
            max={86400}
            required
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
          />
        </div>
        <button className="primary" type="submit" disabled={busy || !current}>
          Activate
        </button>
      </div>
      <p className="hint">
        A TTL is mandatory (1&ndash;86400s). The scenario reverts itself when it expires.
      </p>
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}

function DriverPanel({
  token,
  state,
  onChanged,
}: {
  token: string;
  state: ControlState;
  onChanged: () => void;
}): ReactElement {
  const [mode, setMode] = useState('burst');
  const [multiplier, setMultiplier] = useState('3');
  const [ttl, setTtl] = useState('300');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const driver = state.driver;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.driver(token, {
        mode,
        multiplier: mode === 'burst' ? Number(multiplier) : undefined,
        ttlSeconds: Number(ttl),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!driver.configured) {
    return (
      <section className="panel">
        <h2>Traffic driver</h2>
        <p className="hint">This service has no traffic driver — it only receives requests.</p>
      </section>
    );
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Traffic driver</h2>
      <dl className="kv">
        <dt>Mode</dt>
        <dd>
          <span className={`pill ${driver.mode === 'baseline' ? 'ok' : 'warn'}`}>
            {driver.mode}
            {driver.multiplier > 1 ? ` ×${driver.multiplier}` : ''}
          </span>
        </dd>
        <dt>Rate (effective / cap)</dt>
        <dd className="mono">
          {driver.effectiveRequestsPerMinute} / {driver.maxRequestsPerMinute} per min
        </dd>
        <dt>Last minute</dt>
        <dd className="mono">{driver.requestsLastMinute}</dd>
        <dt>Total sent / failed</dt>
        <dd className="mono">
          {driver.totalRequests} / {driver.totalFailures}
        </dd>
        <dt>Cap hits</dt>
        <dd className="mono">{driver.capHits}</dd>
        {driver.override ? (
          <>
            <dt>Override expires in</dt>
            <dd className="mono">{driver.override.remainingSeconds}s</dd>
          </>
        ) : null}
      </dl>

      <div className="row" style={{ marginTop: 14 }}>
        <div className="field">
          <label htmlFor="mode">Mode</label>
          <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="baseline">baseline</option>
            <option value="burst">burst</option>
            <option value="paused">paused</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="multiplier">multiplier</label>
          <input
            id="multiplier"
            type="number"
            min={1}
            max={100}
            disabled={mode !== 'burst'}
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="dttl">ttlSeconds *</label>
          <input
            id="dttl"
            type="number"
            min={1}
            max={86400}
            required
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
          />
        </div>
        <button className="primary" type="submit" disabled={busy}>
          Apply
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}

function StatePanel({ state }: { state: ControlState }): ReactElement {
  const scenario = state.scenario;
  return (
    <section className="panel">
      <h2>Live state</h2>
      <dl className="kv">
        <dt>Baseline</dt>
        <dd>
          <span className={`pill ${state.baseline.overall ? 'ok' : 'warn'}`}>
            {state.baseline.overall ? 'at baseline' : 'modified'}
          </span>
        </dd>
        <dt>Active scenario</dt>
        <dd className="mono">{scenario ? scenario.id : '—'}</dd>
        {scenario ? (
          <>
            <dt>Reverts in</dt>
            <dd className="mono">{scenario.remainingSeconds}s</dd>
            <dt>Params</dt>
            <dd className="mono">{JSON.stringify(scenario.params)}</dd>
          </>
        ) : null}
        <dt>Chaos rules</dt>
        <dd className="mono">{state.chaos.rules.length}</dd>
        <dt>Uptime</dt>
        <dd className="mono">{Math.floor(state.service.uptimeSeconds / 60)}m</dd>
        <dt>Version</dt>
        <dd className="mono">{state.service.version}</dd>
      </dl>
    </section>
  );
}

function TailPanel({ entries }: { entries: RequestTailEntry[] }): ReactElement {
  return (
    <section className="panel wide">
      <h2>Request tail</h2>
      <div className="tail-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 92 }}>Time</th>
              <th style={{ width: 64 }}>Method</th>
              <th>Path</th>
              <th style={{ width: 60 }}>Status</th>
              <th style={{ width: 70 }}>Latency</th>
              <th style={{ width: 150 }}>Chaos</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="hint">
                  No requests recorded yet.
                </td>
              </tr>
            ) : null}
            {entries.map((entry) => (
              <tr key={entry.seq}>
                <td className="mono">{entry.at.slice(11, 19)}</td>
                <td className="mono">{entry.method}</td>
                <td className="mono" title={entry.path}>
                  {entry.path}
                </td>
                <td className={`mono num ${statusClass(entry.status)}`}>{entry.status}</td>
                <td className="mono num">{entry.latencyMs}ms</td>
                <td className="mono">{entry.chaos?.join(', ') ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function App(): ReactElement {
  const brand = useBrand();
  const [storedToken, setStoredToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [state, setState] = useState<ControlState | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioListing[]>([]);
  const [tail, setTail] = useState<RequestTailEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  /**
   * Set when a Google session is accepted by `/admin` but refused by
   * `/__control`, and re-authenticating did not fix it. Drops the SPA back to
   * the token gate so a `CONTROL_TOKEN` is still a way in while the server
   * side is sorted out.
   */
  const [sessionRejected, setSessionRejected] = useState(false);
  const [tab, setTab] = useState<Tab>('control');
  const docsEnabled = brand?.docs === true;

  /**
   * `null` — not authorized, show `TokenGate`.
   * `''`  — session mode: `adminAuth` is on and no token is stored, so every
   *         `/__control/*` call omits the bearer header and rides on the
   *         cookie the browser already has from signing in with Google.
   * else  — a real pasted `CONTROL_TOKEN`, sent as a bearer regardless of
   *         `adminAuth` (a stored token from before the gate was turned on
   *         keeps working exactly as it always did).
   */
  const token = storedToken ?? (brand?.adminAuth && !sessionRejected ? '' : null);
  // `token` is `''` in session mode, which is falsy — every check below has
  // to compare against `null` explicitly, not just truth-test `token`.
  const authed = token !== null;
  const sessionMode = token === '' && brand?.adminAuth === true;

  useEffect(() => {
    if (brand) {
      document.documentElement.style.setProperty('--accent', brand.brand.color);
      document.title = `${brand.brand.displayName} — sim admin`;
    }
  }, [brand]);

  const refresh = useCallback(async () => {
    if (token === null) return;
    try {
      const [nextState, nextTail] = await Promise.all([
        api.state(token),
        api.requests(token, 50),
      ]);
      setState(nextState);
      setTail(nextTail);
      setError(null);
      // A working control plane re-arms the one-shot recovery, so a session
      // that genuinely expires hours from now still gets its automatic trip
      // through Google rather than an error the first time.
      sessionStorage.removeItem(RECOVERY_KEY);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        if (sessionMode) {
          // The session expired or was revoked — there is no token to forget,
          // just a fresh trip through Google. A full navigation (not a fetch)
          // is required so AdminAuthMiddleware sees it and issues the 302.
          //
          // Bounded, because the recovery only works if the sign-in it
          // triggers produces a session `/__control` will accept. When it does
          // not — a session that authorizes `/admin` but not the control plane
          // — an unbounded retry reloads the page forever, flashing the token
          // gate on every pass and surfacing no error at all. One attempt, and
          // then say what happened.
          if (!sessionStorage.getItem(RECOVERY_KEY)) {
            sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
            window.location.href = '/admin';
            return;
          }
          setError(
            'Signed in, but the control plane rejected the session. ' +
              'Re-authenticating did not help, so this is a server-side ' +
              'problem rather than an expired session — check this service’s ' +
              'logs for the reason, or paste a CONTROL_TOKEN to work around it.',
          );
          setSessionRejected(true);
          return;
        }
        localStorage.removeItem(TOKEN_KEY);
        setStoredToken(null);
        setError('That control token was rejected.');
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [token, sessionMode]);

  useEffect(() => {
    if (token === null) return undefined;
    void refresh();
    api.scenarios(token).then(setScenarios).catch(() => undefined);
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [token, refresh]);

  const saveToken = (value: string): void => {
    localStorage.setItem(TOKEN_KEY, value);
    setStoredToken(value);
  };

  const signOut = (): void => {
    localStorage.removeItem(TOKEN_KEY);
    setStoredToken(null);
    setState(null);
  };

  const reset = async (): Promise<void> => {
    if (token === null) return;
    try {
      await api.reset(token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="shell">
      <header className="top">
        <h1>
          <span className="dot" />
          {brand?.brand.displayName ?? 'sim'} admin
        </h1>
        {brand?.brand.tagline ? <span className="tagline">{brand.brand.tagline}</span> : null}
        <span className="spacer" />
        {authed ? (
          <button className="ghost" type="button" onClick={() => void reset()}>
            Reset to baseline
          </button>
        ) : null}
        {/* A real pasted token, session or not — nothing to "forget" once the
            only credential in play is the Google session. */}
        {storedToken ? (
          <button className="ghost" type="button" onClick={signOut}>
            Forget token
          </button>
        ) : null}
        {brand?.adminAuth ? (
          <a className="as-button" href="/admin/auth/logout">
            Sign out
          </a>
        ) : null}
      </header>

      {token === null ? <TokenGate onSubmit={saveToken} /> : null}
      {error ? <p className="error">{error}</p> : null}

      {token !== null && docsEnabled ? (
        <div className="tabs">
          <button
            type="button"
            className={tab === 'control' ? 'tab active' : 'tab'}
            onClick={() => setTab('control')}
          >
            Control
          </button>
          <button
            type="button"
            className={tab === 'docs' ? 'tab active' : 'tab'}
            onClick={() => setTab('docs')}
          >
            Docs
          </button>
        </div>
      ) : null}

      {token !== null && state && (tab === 'control' || !docsEnabled) ? (
        <div className="grid">
          <StatePanel state={state} />
          <ScenarioPanel token={token} scenarios={scenarios} onChanged={() => void refresh()} />
          <DriverPanel token={token} state={state} onChanged={() => void refresh()} />
          <TailPanel entries={tail} />
        </div>
      ) : null}

      {token !== null && docsEnabled && tab === 'docs' ? (
        <div className="grid">
          <DocsPanel token={token} />
        </div>
      ) : null}
    </div>
  );
}
