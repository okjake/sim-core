import { useCallback, useEffect, useState, type ReactElement } from 'react';

import Activity from './Activity';
import { Advanced, DangerZone } from './Advanced';
import DocsPanel from './DocsPanel';
import ManualControls from './ManualControls';
import ScenarioList from './ScenarioList';
import StatusHeader from './StatusHeader';
import {
  ApiError,
  api,
  type AdminAction,
  type Brand,
  type ControlState,
  type RecordedWebhook,
  type RequestTailEntry,
  type ScenarioListing,
} from './api';
import { ConfirmProvider } from './confirm';
import { errorMessage } from './format';

const TOKEN_KEY = 'sim-core.control-token';
const POLL_MS = 5_000;
/** The tail's default capacity; fetched whole so filtering out admin traffic still leaves rows. */
const TAIL_LIMIT = 200;
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

/** Re-render once a second so countdowns tick between polls. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
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
        Paste this service&rsquo;s <code>CONTROL_TOKEN</code> (it is in the service&rsquo;s
        environment on Render). It is kept in this browser&rsquo;s localStorage and sent as a
        bearer token to <code>/__control</code>.
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
      <div className="gate-actions">
        <button className="primary" type="submit" disabled={!value.trim()}>
          Unlock
        </button>
      </div>
    </form>
  );
}

export default function App(): ReactElement {
  return (
    <ConfirmProvider>
      <Admin />
    </ConfirmProvider>
  );
}

function Admin(): ReactElement {
  const brand = useBrand();
  const now = useNow();
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [webhooks, setWebhooks] = useState<RecordedWebhook[] | null>([]);
  const [resetting, setResetting] = useState(false);
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
      const [nextState, nextTail, nextHooks] = await Promise.all([
        api.state(token),
        api.requests(token, TAIL_LIMIT),
        // Optional: a failure here must not take the whole page down.
        api.webhooks(token).then(
          (r) => r.webhooks,
          () => null,
        ),
      ]);
      setState(nextState);
      setFetchedAt(Date.now());
      setTail(nextTail);
      setWebhooks(nextHooks);
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
    // An older sim-core has no /actions route — no actions, not an error.
    api.actions(token).then(setActions).catch(() => setActions([]));
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
    setResetting(true);
    try {
      await api.reset(token);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResetting(false);
    }
  };

  const showControl = token !== null && state !== null && (tab === 'control' || !docsEnabled);
  const hasManual = state !== null && (state.driver.configured || actions.length > 0);

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="dot" aria-hidden="true" />
          <h1>{brand?.brand.displayName ?? 'sim'}</h1>
          <span className="brand-sub">sim admin</span>
        </div>
        {token !== null && docsEnabled ? (
          <nav className="tabs" aria-label="Sections">
            <button
              type="button"
              className={tab === 'control' ? 'tab active' : 'tab'}
              aria-current={tab === 'control' ? 'page' : undefined}
              onClick={() => setTab('control')}
            >
              Control
            </button>
            <button
              type="button"
              className={tab === 'docs' ? 'tab active' : 'tab'}
              aria-current={tab === 'docs' ? 'page' : undefined}
              onClick={() => setTab('docs')}
            >
              Docs
            </button>
          </nav>
        ) : null}
        <span className="spacer" />
        <div className="session">
          {/* A real pasted token, session or not — nothing to "forget" once the
              only credential in play is the Google session. */}
          {storedToken ? (
            <button className="ghost small" type="button" onClick={signOut}>
              Forget token
            </button>
          ) : null}
          {brand?.adminAuth ? (
            <a className="as-button ghost small" href="/admin/auth/logout">
              Sign out
            </a>
          ) : null}
        </div>
      </header>

      {token === null ? <TokenGate onSubmit={saveToken} /> : null}
      {error ? (
        <p className="error banner" role="alert">
          {error}
        </p>
      ) : null}

      {token !== null && state === null && !error ? <p className="hint loading">Loading…</p> : null}

      {showControl && state ? (
        <main className="control-page">
          <StatusHeader
            state={state}
            fetchedAt={fetchedAt}
            now={now}
            tail={tail}
            scenarios={scenarios}
            busy={resetting}
            onReset={() => void reset()}
          />
          <div className={hasManual ? 'columns' : 'columns single'}>
            <ScenarioList
              token={token}
              scenarios={scenarios}
              state={state}
              fetchedAt={fetchedAt}
              now={now}
              onChanged={() => void refresh()}
            />
            <ManualControls
              token={token}
              state={state}
              actions={actions}
              fetchedAt={fetchedAt}
              now={now}
              onChanged={() => void refresh()}
            />
          </div>
          <Activity
            tail={tail}
            webhooks={webhooks}
            sendsTraffic={state.driver.configured}
            capacity={state.requestTail.capacity}
          />
          <Advanced state={state} />
          <DangerZone token={token} docsEnabled={docsEnabled} onChanged={() => void refresh()} />
        </main>
      ) : null}

      {token !== null && docsEnabled && tab === 'docs' ? (
        <main>
          <DocsPanel token={token} />
        </main>
      ) : null}
    </div>
  );
}
