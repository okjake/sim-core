import { BadRequestException } from '@nestjs/common';

import type { DriverMode } from '../driver/driver.types';

export const TTL_MIN_SECONDS = 1;
export const TTL_MAX_SECONDS = 86_400;

export interface ActivateScenarioBody {
  scenario: string;
  params?: unknown;
  ttlSeconds: number;
}

export interface DriverOverrideBody {
  mode: DriverMode;
  multiplier?: number;
  ttlSeconds: number;
}

const DRIVER_MODES: DriverMode[] = ['baseline', 'burst', 'paused'];

function fail(errors: Record<string, string>): never {
  throw new BadRequestException({
    error: 'validation_failed',
    message: 'Request body failed validation',
    errors,
  });
}

/**
 * TTL is MANDATORY on every activation. A sim service that can be left broken
 * forever is worse than no sim service, so there is no "until I say stop" mode.
 */
export function parseTtlSeconds(value: unknown, errors: Record<string, string>): number {
  if (value === undefined || value === null || value === '') {
    errors.ttlSeconds = 'is required';
    return 0;
  }
  const ttl = typeof value === 'string' ? Number(value) : value;
  if (typeof ttl !== 'number' || !Number.isFinite(ttl) || !Number.isInteger(ttl)) {
    errors.ttlSeconds = 'must be an integer number of seconds';
    return 0;
  }
  if (ttl < TTL_MIN_SECONDS || ttl > TTL_MAX_SECONDS) {
    errors.ttlSeconds = `must be between ${TTL_MIN_SECONDS} and ${TTL_MAX_SECONDS}`;
    return 0;
  }
  return ttl;
}

export function parseActivateScenarioBody(body: unknown): ActivateScenarioBody {
  const errors: Record<string, string> = {};
  const source = (body ?? {}) as Record<string, unknown>;

  const scenario = source.scenario;
  if (typeof scenario !== 'string' || scenario.trim().length === 0) {
    errors.scenario = 'is required';
  }
  const ttlSeconds = parseTtlSeconds(source.ttlSeconds, errors);

  if (Object.keys(errors).length > 0) {
    fail(errors);
  }

  return { scenario: (scenario as string).trim(), params: source.params, ttlSeconds };
}

export function parseDriverOverrideBody(body: unknown): DriverOverrideBody {
  const errors: Record<string, string> = {};
  const source = (body ?? {}) as Record<string, unknown>;

  const mode = source.mode;
  if (typeof mode !== 'string' || !DRIVER_MODES.includes(mode as DriverMode)) {
    errors.mode = `must be one of: ${DRIVER_MODES.join(', ')}`;
  }

  let multiplier = 1;
  if (source.multiplier !== undefined && source.multiplier !== null) {
    const raw =
      typeof source.multiplier === 'string' ? Number(source.multiplier) : source.multiplier;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1 || raw > 100) {
      errors.multiplier = 'must be a number between 1 and 100';
    } else {
      multiplier = raw;
    }
  }

  const ttlSeconds = parseTtlSeconds(source.ttlSeconds, errors);

  if (Object.keys(errors).length > 0) {
    fail(errors);
  }

  return { mode: mode as DriverMode, multiplier, ttlSeconds };
}
