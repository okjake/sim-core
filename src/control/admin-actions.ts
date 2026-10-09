/**
 * Sim-declared admin actions (v0.5.0).
 *
 * Several sims mount their own `/__control/*` routes for operations that are
 * not TTL-bounded scenarios — Staybase's `POST /__control/push-metrics`,
 * Pebblepay's `POST /__control/auth-scheme`. Before v0.5.0 those were curl-only:
 * the shared SPA had no way to know they existed. An `AdminAction` is a small
 * declarative description of one, so `/admin` can render a button for it
 * without sim-core knowing anything about what it does.
 *
 * Deliberately narrow:
 * - the route must already exist and must live under `/__control/`, so it is
 *   behind the same `ControlAuthGuard` as everything else the SPA calls;
 * - the SPA only ever POSTs, with either no body or `{ [choice.name]: value }`;
 * - nothing here registers a route or changes one. Declaring an action for a
 *   path that does not exist produces a button that 404s, nothing worse.
 */
export interface AdminActionChoice {
  /** JSON body key the chosen value is sent under, e.g. `scheme`. */
  name: string;
  /** Label for the picker, e.g. `Credential scheme`. */
  label: string;
  options: readonly string[];
  /**
   * Optional `GET` under `/__control/` that reports the current value, read
   * from `currentKey` of its JSON response, so the SPA can show what is set
   * now and pre-select it.
   */
  currentPath?: string;
  currentKey?: string;
}

export interface AdminAction {
  /** Unique among this service's actions. */
  id: string;
  title: string;
  /** One or two plain sentences: what pressing it does. */
  description: string;
  /** Partner API automations it feeds, as for `ScenarioAdminMeta.triggers`. */
  triggers?: string[];
  /** A `POST` route under `/__control/`. */
  path: string;
  /** Button label. Default `Run`. */
  submitLabel?: string;
  /** Present → a single choice sent as the JSON body. */
  choice?: AdminActionChoice;
  /**
   * Present → the SPA asks before running, showing this text. Use it for
   * anything that is not trivially repeatable.
   */
  confirm?: string;
  /**
   * Whether the effect lasts until changed again (no TTL). Shown as a note so
   * nobody expects it to revert like a scenario.
   */
  persistent?: boolean;
}

const CONTROL_PREFIX = '/__control/';

function isControlPath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.startsWith(CONTROL_PREFIX) &&
    path.length > CONTROL_PREFIX.length &&
    !path.includes('..') &&
    // Browsers normalise `%2e%2e` segments to `..`; no control route needs `%`.
    !path.includes('%') &&
    !path.includes('?') &&
    !path.includes('#')
  );
}

/**
 * Fail fast at bootstrap on an action the SPA could not safely call. An action
 * pointed outside `/__control/` would send the operator's credential to a route
 * that is not behind the control guard, so it is a config error, not a warning.
 */
export function validateAdminActions(actions: readonly AdminAction[] | undefined): void {
  if (actions === undefined) return;
  if (!Array.isArray(actions)) {
    throw new Error('SimCoreConfig.adminActions must be an array');
  }
  const seen = new Set<string>();
  for (const action of actions) {
    const label = `SimCoreConfig.adminActions[${JSON.stringify(action?.id ?? '?')}]`;
    if (!action || typeof action.id !== 'string' || !action.id.trim()) {
      throw new Error('SimCoreConfig.adminActions: every action needs a non-empty id');
    }
    if (seen.has(action.id)) {
      throw new Error(`${label}: duplicate id`);
    }
    seen.add(action.id);
    if (typeof action.title !== 'string' || !action.title.trim()) {
      throw new Error(`${label}.title is required`);
    }
    if (!isControlPath(action.path)) {
      throw new Error(`${label}.path must be a route under ${CONTROL_PREFIX}`);
    }
    if (action.choice) {
      const { name, options, currentPath } = action.choice;
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error(`${label}.choice.name is required`);
      }
      if (!Array.isArray(options) || options.length === 0) {
        throw new Error(`${label}.choice.options must be a non-empty array`);
      }
      if (currentPath !== undefined && !isControlPath(currentPath)) {
        throw new Error(`${label}.choice.currentPath must be a route under ${CONTROL_PREFIX}`);
      }
    }
  }
}
