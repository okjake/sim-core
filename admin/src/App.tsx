import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react';

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
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [state, setState] = useState<ControlState | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioListing[]>([]);
  const [tail, setTail] = useState<RequestTailEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (brand) {
      document.documentElement.style.setProperty('--accent', brand.brand.color);
      document.title = `${brand.brand.displayName} — sim admin`;
    }
  }, [brand]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [nextState, nextTail] = await Promise.all([
        api.state(token),
        api.requests(token, 50),
      ]);
      setState(nextState);
      setTail(nextTail);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setError('That control token was rejected.');
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    void refresh();
    api.scenarios(token).then(setScenarios).catch(() => undefined);
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [token, refresh]);

  const saveToken = (value: string): void => {
    localStorage.setItem(TOKEN_KEY, value);
    setToken(value);
  };

  const signOut = (): void => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setState(null);
  };

  const reset = async (): Promise<void> => {
    if (!token) return;
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
        {token ? (
          <>
            <button className="ghost" type="button" onClick={() => void reset()}>
              Reset to baseline
            </button>
            <button className="ghost" type="button" onClick={signOut}>
              Forget token
            </button>
          </>
        ) : null}
      </header>

      {!token ? <TokenGate onSubmit={saveToken} /> : null}
      {error ? <p className="error">{error}</p> : null}

      {token && state ? (
        <div className="grid">
          <StatePanel state={state} />
          <ScenarioPanel token={token} scenarios={scenarios} onChanged={() => void refresh()} />
          <DriverPanel token={token} state={state} onChanged={() => void refresh()} />
          <TailPanel entries={tail} />
        </div>
      ) : null}
    </div>
  );
}
