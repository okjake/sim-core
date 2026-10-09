/** `4:05`, `1:02:09`. Countdown display for TTLs. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** `5 min`, `1 h`, `90 s` — for duration choices. */
export function duration(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/** `just now`, `12 s ago`, `4 min ago`, `2 h ago`. */
export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never';
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 3) return 'just now';
  if (seconds < 90) return `${seconds} s ago`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

/** Local wall-clock `HH:MM`, for "reverts at". */
export function wallClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function percent(part: number, whole: number): string {
  if (whole === 0) return '0%';
  const value = (part / whole) * 100;
  return value > 0 && value < 1 ? '<1%' : `${Math.round(value)}%`;
}

/**
 * Requests the admin page itself causes — its own polling, assets, the brand
 * call, the Google gate. Hidden from the activity view by default so the tail
 * shows what the sim is actually doing.
 */
export function isOperatorTraffic(path: string): boolean {
  return (
    path.startsWith('/__control') ||
    path.startsWith('/__admin') ||
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path === '/health'
  );
}

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
