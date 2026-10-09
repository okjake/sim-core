import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { api, type AdminAction, type ControlState } from './api';
import { useConfirm } from './confirm';
import DurationPicker, { durationSeconds, initialDuration } from './Duration';
import { clock, errorMessage } from './format';

interface Props {
  token: string;
  state: ControlState;
  actions: AdminAction[];
  fetchedAt: number;
  now: number;
  onChanged: () => void;
}

/**
 * Direct levers that are not scenarios: the traffic driver override (for sims
 * that send traffic) and any `/__control/*` routes the sim declared as
 * `adminActions`. Renders nothing when a sim has neither.
 */
export default function ManualControls(props: Props): ReactElement | null {
  const { state, actions } = props;
  if (!state.driver.configured && actions.length === 0) return null;
  return (
    <section className="section" aria-labelledby="manual-h">
      <div className="section-head">
        <h2 id="manual-h">Manual controls</h2>
      </div>
      {state.driver.configured ? <TrafficControl {...props} /> : null}
      {actions.map((action) => (
        <ActionControl key={action.id} token={props.token} action={action} onChanged={props.onChanged} />
      ))}
    </section>
  );
}

type Mode = 'baseline' | 'burst' | 'paused';
const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'burst', label: 'Burst' },
  { id: 'paused', label: 'Pause' },
  { id: 'baseline', label: 'Baseline' },
];

function TrafficControl({ token, state, fetchedAt, now, onChanged }: Props): ReactElement {
  const driver = state.driver;
  const [mode, setMode] = useState<Mode>('burst');
  const [multiplier, setMultiplier] = useState('3');
  const [ttlValue, setTtlValue] = useState(() => initialDuration(300));
  const ttl = durationSeconds(ttlValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = async (): Promise<void> => {
    if (ttl === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.driver(token, {
        mode,
        multiplier: mode === 'burst' ? Number(multiplier) : undefined,
        ttlSeconds: ttl ?? 300,
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const override = driver.override;
  const left = override ? override.remainingSeconds - (now - fetchedAt) / 1000 : 0;
  const multiplierValid = Number(multiplier) >= 1 && Number(multiplier) <= 100;

  return (
    <div className="control">
      <div className="control-head">
        <h3>Traffic</h3>
        <span className={`tag ${driver.mode === 'baseline' ? 'ok' : 'warn'}`}>
          {driver.mode}
          {driver.multiplier > 1 ? ` ×${driver.multiplier}` : ''}
        </span>
      </div>
      <p className="control-desc">
        Override the traffic this sim sends for a while. The hard cap of{' '}
        {driver.maxRequestsPerMinute}/min always applies.
        {override ? ` Current override ends in ${clock(left)}.` : ''}
      </p>
      <div className="segmented" role="group" aria-label="Traffic mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            className={mode === m.id ? 'seg is-on' : 'seg'}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="control-row">
        {mode === 'burst' ? (
          <div className="field narrow">
            <label htmlFor="multiplier">Multiplier</label>
            <input
              id="multiplier"
              type="number"
              min={1}
              max={100}
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
            />
          </div>
        ) : null}
        <div className="field">
          <DurationPicker id="driver-ttl" label="For" value={ttlValue} onChange={setTtlValue} />
        </div>
        <button
          type="button"
          className="primary"
          disabled={busy || ttl === null || (mode === 'burst' && !multiplierValid)}
          onClick={() => void apply()}
        >
          {busy ? 'Applying…' : 'Apply'}
        </button>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ActionControl({
  token,
  action,
  onChanged,
}: {
  token: string;
  action: AdminAction;
  onChanged: () => void;
}): ReactElement {
  const confirm = useConfirm();
  const choice = action.choice;
  const [current, setCurrent] = useState<string | null>(null);
  const [value, setValue] = useState<string>(choice?.options[0] ?? '');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readCurrent = useCallback(async () => {
    if (!choice?.currentPath) return;
    try {
      const body = (await api.readAction(token, choice.currentPath)) as Record<string, unknown>;
      const next = body?.[choice.currentKey ?? choice.name];
      if (typeof next === 'string') {
        setCurrent(next);
        setValue(next);
      }
    } catch {
      setCurrent(null);
    }
  }, [token, choice?.currentPath, choice?.currentKey, choice?.name]);

  useEffect(() => {
    void readCurrent();
  }, [readCurrent]);

  const run = async (): Promise<void> => {
    if (action.confirm) {
      const ok = await confirm({
        title: `${action.title}?`,
        body: <p>{action.confirm}</p>,
        confirmLabel: action.submitLabel ?? 'Run',
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = choice ? { [choice.name]: value } : undefined;
      setResult(await api.runAction(token, action.path, body));
      await readCurrent();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const unchanged = choice !== undefined && current !== null && value === current;

  return (
    <div className="control">
      <div className="control-head">
        <h3>{action.title}</h3>
        {current !== null ? <span className="tag">now: {current}</span> : null}
      </div>
      <p className="control-desc">{action.description}</p>
      {action.triggers?.length ? (
        <p className="run-triggers">
          <span className="triggers-label">Triggers</span>
          {action.triggers.map((trigger) => (
            <span key={trigger} className="trigger">
              {trigger}
            </span>
          ))}
        </p>
      ) : null}
      {action.persistent ? (
        <p className="run-undo">Stays until changed again; it does not expire like a scenario.</p>
      ) : null}
      <div className="control-row">
        {choice ? (
          <div className="field">
            <label htmlFor={`action-${action.id}`}>{choice.label}</label>
            <select id={`action-${action.id}`} value={value} onChange={(e) => setValue(e.target.value)}>
              {choice.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                  {option === current ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button
          type="button"
          className="primary"
          disabled={busy || unchanged}
          onClick={() => void run()}
          title={unchanged ? 'Already set' : undefined}
        >
          {busy ? 'Working…' : (action.submitLabel ?? 'Run')}
        </button>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {result !== null && !error ? (
        <details className="result">
          <summary>Done: show response</summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}
