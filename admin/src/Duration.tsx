import type { ReactElement } from 'react';

import { duration } from './format';

/** The control plane's TTL bounds (`control.dto.ts`). */
export const TTL_MIN = 1;
export const TTL_MAX = 86_400;
export const DURATION_PRESETS = [60, 300, 900, 1800, 3600, 4 * 3600, 24 * 3600];

export interface DurationValue {
  /** A preset in seconds, as a string, or `custom`. */
  choice: string;
  /** Seconds, used when `choice` is `custom`. */
  custom: string;
}

export function initialDuration(seconds: number): DurationValue {
  return DURATION_PRESETS.includes(seconds)
    ? { choice: String(seconds), custom: String(seconds) }
    : { choice: 'custom', custom: String(seconds) };
}

/** Seconds, or `null` when the custom value is outside 1–86400. */
export function durationSeconds(value: DurationValue): number | null {
  const seconds = Number(value.choice === 'custom' ? value.custom : value.choice);
  return Number.isInteger(seconds) && seconds >= TTL_MIN && seconds <= TTL_MAX ? seconds : null;
}

/**
 * Preset durations (1 min – 24 h) plus "custom…" seconds bounded to the
 * control plane's 1–86400, so nothing the old raw `ttlSeconds` field accepted
 * is out of reach.
 */
export default function DurationPicker({
  id,
  label,
  value,
  onChange,
  prefix = '',
  hideLabel = false,
}: {
  id: string;
  label: string;
  value: DurationValue;
  onChange: (next: DurationValue) => void;
  prefix?: string;
  hideLabel?: boolean;
}): ReactElement {
  return (
    <div className="ttl">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : undefined}>
        {label}
      </label>
      <div className="ttl-inputs">
        <select id={id} value={value.choice} onChange={(e) => onChange({ ...value, choice: e.target.value })}>
          {DURATION_PRESETS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {prefix}
              {duration(seconds)}
            </option>
          ))}
          <option value="custom">custom…</option>
        </select>
        {value.choice === 'custom' ? (
          <input
            aria-label={`${label}, in seconds (1 to 86400)`}
            type="number"
            min={TTL_MIN}
            max={TTL_MAX}
            value={value.custom}
            onChange={(e) => onChange({ ...value, custom: e.target.value })}
            className="ttl-custom"
            placeholder="seconds"
          />
        ) : null}
      </div>
    </div>
  );
}
