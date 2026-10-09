import type { ReactElement } from 'react';

import type { ControlState, RequestTailEntry, ScenarioListing } from './api';
import { ago, clock, isOperatorTraffic, percent, wallClock } from './format';

interface Props {
  state: ControlState;
  /** Epoch ms when `state` was fetched — countdowns run from there. */
  fetchedAt: number;
  now: number;
  tail: RequestTailEntry[];
  scenarios: ScenarioListing[];
  busy: boolean;
  onReset: () => void;
}

export function scenarioTitle(id: string, scenarios: ScenarioListing[]): string {
  return scenarios.find((s) => s.id === id)?.admin?.title ?? id;
}

/**
 * The first thing on the page: what is this sim doing right now, and the one
 * button that puts it back. Everything here is read from `/__control/state`
 * and the request tail; nothing is invented.
 */
export default function StatusHeader({
  state,
  fetchedAt,
  now,
  tail,
  scenarios,
  busy,
  onReset,
}: Props): ReactElement {
  const elapsed = (now - fetchedAt) / 1000;
  const scenario = state.scenario;
  const scenarioMeta = scenario ? scenarios.find((s) => s.id === scenario.id)?.admin : null;
  const override = state.driver.override;
  const atBaseline = state.baseline.overall;

  const lines: Array<{ key: string; title: string; detail: string }> = [];
  if (scenario) {
    const left = scenario.remainingSeconds - elapsed;
    lines.push({
      key: 'scenario',
      title: `${scenarioTitle(scenario.id, scenarios)} is running`,
      detail: scenarioMeta?.durable
        ? 'Permanent: its effect stays after this run ends.'
        : `Reverts in ${clock(left)}, at ${wallClock(fetchedAt + scenario.remainingSeconds * 1000)}`,
    });
  }
  if (override) {
    const left = override.remainingSeconds - elapsed;
    const label =
      override.mode === 'burst'
        ? `Traffic burst ×${override.multiplier}`
        : override.mode === 'paused'
          ? 'Traffic paused'
          : 'Traffic held at baseline';
    lines.push({
      key: 'override',
      title: label,
      detail: `Manual override, ends in ${clock(left)}`,
    });
  }
  if (!atBaseline && lines.length === 0) {
    lines.push({
      key: 'modified',
      title: 'Modified',
      detail: `${state.chaos.rules.length} fault rule(s) or a traffic change active with no scenario. Reset clears it.`,
    });
  }

  return (
    <section className={`status ${atBaseline ? 'is-baseline' : 'is-modified'}`} aria-label="Status">
      <div className="status-main">
        <span className="status-light" aria-hidden="true" />
        <div className="status-text" aria-live="polite">
          {atBaseline ? (
            <>
              <p className="status-title">At baseline</p>
              <p className="status-detail">Normal traffic, no faults. Pick a scenario below to change that.</p>
            </>
          ) : (
            lines.map((line) => (
              <div key={line.key} className="status-line">
                <p className="status-title">{line.title}</p>
                <p className="status-detail">{line.detail}</p>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          className={atBaseline ? 'ghost' : 'danger'}
          disabled={busy || atBaseline}
          title={atBaseline ? 'Already at baseline' : undefined}
          onClick={onReset}
        >
          Stop and reset to baseline
        </button>
      </div>
      <Facts state={state} tail={tail} now={now} />
    </section>
  );
}

function Facts({
  state,
  tail,
  now,
}: {
  state: ControlState;
  tail: RequestTailEntry[];
  now: number;
}): ReactElement {
  const driver = state.driver;
  const facts: Array<{ label: string; value: string; tone?: 'warn' | 'err' }> = [];

  if (driver.configured) {
    facts.push({
      label: `Target rate (cap ${driver.maxRequestsPerMinute})`,
      value: driver.mode === 'paused' ? 'Paused' : `${driver.effectiveRequestsPerMinute}/min`,
    });
    facts.push({ label: 'Sent last minute', value: String(driver.requestsLastMinute) });
    facts.push({
      label: 'Failed',
      value: `${driver.totalFailures} of ${driver.totalRequests} (${percent(driver.totalFailures, driver.totalRequests)})`,
      tone: driver.totalRequests > 20 && driver.totalFailures / driver.totalRequests > 0.1 ? 'warn' : undefined,
    });
    facts.push({ label: 'Last sent', value: ago(driver.lastRequestAt, now) });
  } else {
    // A receive-only sim has no driver counters; the request tail is the
    // evidence. Admin traffic is excluded so the page does not count itself.
    const domain = tail.filter((entry) => !isOperatorTraffic(entry.path));
    const lastMinute = domain.filter((entry) => now - Date.parse(entry.at) <= 60_000).length;
    const s4 = domain.filter((entry) => entry.status >= 400 && entry.status < 500).length;
    const s5 = domain.filter((entry) => entry.status >= 500).length;
    facts.push({ label: 'Received', value: `${lastMinute} in the last minute` });
    facts.push({
      label: `Errors (last ${domain.length})`,
      value: `${percent(s4, domain.length)} 4xx · ${percent(s5, domain.length)} 5xx`,
      tone: domain.length > 10 && s5 / domain.length > 0.1 ? 'err' : s4 / Math.max(1, domain.length) > 0.2 ? 'warn' : undefined,
    });
    facts.push({ label: 'Last request', value: ago(domain[0]?.at, now) });
  }

  facts.push({ label: 'Up', value: formatUptime(state.service.uptimeSeconds) });
  facts.push({ label: 'Version', value: state.service.version });

  return (
    <dl className="facts">
      {facts.map((fact) => (
        <div key={fact.label} className={fact.tone ? `fact ${fact.tone}` : 'fact'}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
