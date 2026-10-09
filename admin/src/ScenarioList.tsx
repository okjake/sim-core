import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { api, type ControlState, type ParamDescription, type ScenarioListing } from './api';
import { useConfirm } from './confirm';
import DurationPicker, { durationSeconds, initialDuration } from './Duration';
import { clock, errorMessage } from './format';
import { scenarioTitle } from './StatusHeader';

const DEFAULT_TTL = 300;
/**
 * A durable scenario's effect never reverts, but the control plane still
 * requires a TTL for the slot it occupies. A minute by default keeps the
 * status header honest without holding the slot for long; it is adjustable
 * under Options for anything that keys off the run window.
 */
const DURABLE_SLOT_TTL = 60;
const BUILTIN_GROUP = 'Generic faults';
const FALLBACK_GROUP = 'Scenarios';

interface Props {
  token: string;
  scenarios: ScenarioListing[];
  state: ControlState;
  fetchedAt: number;
  now: number;
  onChanged: () => void;
}

/**
 * Scenarios as a runbook: named, one-click runs grouped by what they are for,
 * each saying which Partner API automation it should set off. Parameters keep
 * their defaults unless someone opens "Options".
 *
 * Groups are data-driven (`ScenarioAdminMeta.group`), so a sim adds a new
 * section — e.g. a future "Partner actor" group — by tagging its scenarios,
 * with no SPA change.
 */
export default function ScenarioList({
  token,
  scenarios,
  state,
  fetchedAt,
  now,
  onChanged,
}: Props): ReactElement {
  const groups = useMemo(() => groupScenarios(scenarios), [scenarios]);
  const sendsTraffic = state.driver.configured;

  if (scenarios.length === 0) {
    return (
      <section className="section" aria-labelledby="scenarios-h">
        <h2 id="scenarios-h">Scenarios</h2>
        <p className="hint">Loading scenarios…</p>
      </section>
    );
  }

  return (
    <section className="section" aria-labelledby="scenarios-h">
      <div className="section-head">
        <h2 id="scenarios-h">Scenarios</h2>
        <p className="section-sub">
          One scenario runs at a time. Each one ends itself when its time is up, unless it is marked
          permanent.
        </p>
      </div>
      {groups.map(([group, items]) => (
        <div key={group} className="group">
          <h3>{group}</h3>
          {group === BUILTIN_GROUP && sendsTraffic ? (
            <p className="group-note">
              These break requests this service <em>receives</em>. This sim mostly sends traffic, so
              they only touch its small inbound API.
            </p>
          ) : null}
          <ul className="runbook">
            {items.map((scenario) => (
              <ScenarioRow
                key={scenario.id}
                token={token}
                scenario={scenario}
                scenarios={scenarios}
                state={state}
                fetchedAt={fetchedAt}
                now={now}
                onChanged={onChanged}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function groupScenarios(scenarios: ScenarioListing[]): Array<[string, ScenarioListing[]]> {
  const map = new Map<string, ScenarioListing[]>();
  for (const scenario of scenarios) {
    const group = scenario.admin?.group ?? FALLBACK_GROUP;
    map.set(group, [...(map.get(group) ?? []), scenario]);
  }
  for (const items of map.values()) {
    items.sort((a, b) => {
      const oa = a.admin?.order ?? Number.POSITIVE_INFINITY;
      const ob = b.admin?.order ?? Number.POSITIVE_INFINITY;
      if (oa !== ob) return oa - ob;
      return (a.admin?.title ?? a.id).localeCompare(b.admin?.title ?? b.id);
    });
  }
  // The sim's own groups first, in first-seen order; the generic built-ins last.
  return [...map.entries()].sort(([a], [b]) => Number(a === BUILTIN_GROUP) - Number(b === BUILTIN_GROUP));
}

function defaultsFor(params: ParamDescription | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, field] of Object.entries(params?.fields ?? {})) {
    out[key] = field.default === undefined ? '' : String(field.default);
  }
  return out;
}

function ScenarioRow({
  token,
  scenario,
  scenarios,
  state,
  fetchedAt,
  now,
  onChanged,
}: {
  token: string;
  scenario: ScenarioListing;
  scenarios: ScenarioListing[];
  state: ControlState;
  fetchedAt: number;
  now: number;
  onChanged: () => void;
}): ReactElement {
  const confirm = useConfirm();
  const meta = scenario.admin ?? {};
  const title = meta.title ?? scenario.id;
  const durable = meta.durable === true;
  const initialTtl = meta.defaultTtlSeconds ?? (durable ? DURABLE_SLOT_TTL : DEFAULT_TTL);
  const [ttlValue, setTtlValue] = useState(() => initialDuration(initialTtl));
  const [values, setValues] = useState<Record<string, string>>(() => defaultsFor(scenario.params));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValues(defaultsFor(scenario.params));
  }, [scenario.id, scenario.params]);

  const fields = Object.entries(scenario.params?.fields ?? {});
  const defaults = defaultsFor(scenario.params);
  const changed = fields.filter(([key]) => (values[key] ?? '') !== (defaults[key] ?? ''));
  const active = state.scenario?.id === scenario.id ? state.scenario : null;
  const other = state.scenario && !active ? state.scenario : null;
  const ttl = durationSeconds(ttlValue);
  const ttlValid = ttl !== null;
  const otherMeta = other ? scenarios.find((s) => s.id === other.id)?.admin : null;
  const otherLeft = other ? other.remainingSeconds - (now - fetchedAt) / 1000 : 0;
  /** What replacing the running scenario does — its effect stays if it was permanent. */
  const replaceNote = other
    ? otherMeta?.durable
      ? `${scenarioTitle(other.id, scenarios)} still holds the run slot. Its effect is permanent and stays; only the slot ends.`
      : `${scenarioTitle(other.id, scenarios)} is running with ${clock(otherLeft)} left. Only one scenario runs at a time: starting ${title} ends it now.`
    : null;

  const run = async (): Promise<void> => {
    if (durable) {
      const ok = await confirm({
        title: `${title}?`,
        body: (
          <>
            <p>{scenario.description}</p>
            <p>
              <strong>This is permanent.</strong> It does not revert when its time is up, and Stop
              and reset does not undo it.
              {meta.undo ? ` To undo it: ${meta.undo}.` : ''}
            </p>
            {replaceNote ? <p>{replaceNote}</p> : null}
          </>
        ),
        confirmLabel: 'Run, permanently',
        tone: 'danger',
      });
      if (!ok) return;
    } else if (other && replaceNote) {
      const ok = await confirm({
        title: `Replace ${scenarioTitle(other.id, scenarios)}?`,
        body: <p>{replaceNote}</p>,
        confirmLabel: `Replace with ${title}`,
      });
      if (!ok) return;
    }

    setBusy(true);
    setError(null);
    try {
      const params: Record<string, unknown> = {};
      for (const [key, field] of fields) {
        const raw = values[key];
        if (raw === undefined || raw === '') continue;
        params[key] = field.type === 'number' ? Number(raw) : raw;
      }
      if (ttl === null) return;
      await api.activate(token, { scenario: scenario.id, params, ttlSeconds: ttl });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remaining = active ? active.remainingSeconds - (now - fetchedAt) / 1000 : 0;

  return (
    <li className={active ? 'run is-active' : 'run'}>
      <div className="run-body">
        <div className="run-title">
          <span className="run-name">{title}</span>
          {durable ? <span className="tag warn">Permanent</span> : null}
          {active ? (
            <span className="tag live">
              {durable ? 'Just ran' : `Running · ${clock(remaining)} left`}
            </span>
          ) : null}
          {title !== scenario.id ? <code className="run-id">{scenario.id}</code> : null}
        </div>
        <p className="run-desc">{scenario.description}</p>
        {meta.triggers?.length ? (
          <p className="run-triggers">
            <span className="triggers-label">Triggers</span>
            {meta.triggers.map((trigger) => (
              <span key={trigger} className="trigger">
                {trigger}
              </span>
            ))}
          </p>
        ) : null}
        {durable && meta.undo ? <p className="run-undo">Undo: {meta.undo}</p> : null}
        {fields.length > 0 ? (
          <details className="options">
            <summary>
              Options
              <span className="options-summary">
                {changed.length === 0
                  ? ' · defaults'
                  : ` · ${changed.map(([key]) => `${key} ${values[key]}`).join(', ')}`}
              </span>
            </summary>
            <div className="options-grid">
              {fields.map(([key, field]) => (
                <div className="field" key={key}>
                  <label htmlFor={`p-${scenario.id}-${key}`}>
                    {field.description ?? key}
                    <code>{key}</code>
                  </label>
                  {field.values ? (
                    <select
                      id={`p-${scenario.id}-${key}`}
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
                      id={`p-${scenario.id}-${key}`}
                      type={field.type === 'number' ? 'number' : 'text'}
                      min={field.min}
                      max={field.max}
                      step={field.type === 'number' ? 'any' : undefined}
                      placeholder={field.required ? '' : 'optional'}
                      value={values[key] ?? ''}
                      onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
              {durable ? (
                <div className="field">
                  <DurationPicker
                    id={`ttl-${scenario.id}`}
                    label="Run slot (the effect itself is permanent)"
                    value={ttlValue}
                    onChange={setTtlValue}
                  />
                </div>
              ) : null}
              {changed.length > 0 ? (
                <button type="button" className="link-button" onClick={() => setValues(defaults)}>
                  Restore defaults
                </button>
              ) : null}
            </div>
          </details>
        ) : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="run-controls">
        {durable ? null : (
          <DurationPicker
            id={`ttl-${scenario.id}`}
            label={`How long ${title} runs`}
            value={ttlValue}
            onChange={setTtlValue}
            prefix="for "
            hideLabel
          />
        )}
        <button
          type="button"
          className="primary"
          disabled={busy || !ttlValid}
          onClick={() => void run()}
          aria-label={`${active ? 'Restart' : 'Run'} ${title}`}
        >
          {busy ? 'Starting…' : active ? 'Restart' : durable ? 'Run…' : 'Run'}
        </button>
      </div>
    </li>
  );
}
