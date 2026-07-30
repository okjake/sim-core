export interface Brand {
  name: string;
  version: string;
  brand: { displayName: string; color: string; tagline?: string };
  driver: boolean;
  /** Docs engine enabled? Drives whether the Docs tab is offered at all. */
  docs?: boolean;
  /**
   * Google gate in front of /admin? Only drives whether a Sign out link is
   * shown — if it is false there is no session to end, and the control token
   * (a separate credential) is cleared by "Forget token".
   */
  adminAuth?: boolean;
}

export interface ScenarioListing {
  id: string;
  description: string;
  params: ParamDescription | null;
}

export interface ParamDescription {
  type: string;
  required: boolean;
  description?: string;
  default?: unknown;
  min?: number;
  max?: number;
  values?: string[];
  fields?: Record<string, ParamDescription>;
}

export interface ControlState {
  service: {
    name: string;
    brand: Brand['brand'];
    version: string;
    startedAt: string;
    uptimeSeconds: number;
  };
  scenario: {
    id: string;
    description: string;
    params: unknown;
    expiresAt: string;
    ttlSeconds: number;
    remainingSeconds: number;
  } | null;
  chaos: { baseline: boolean; rules: Array<Record<string, unknown>> };
  driver: {
    configured: boolean;
    running: boolean;
    mode: string;
    multiplier: number;
    baselineRequestsPerMinute: number;
    maxRequestsPerMinute: number;
    effectiveRequestsPerMinute: number;
    requestsLastMinute: number;
    totalRequests: number;
    totalFailures: number;
    capHits: number;
    currentFlow: string | null;
    override: { mode: string; multiplier: number; remainingSeconds: number } | null;
    flows: Record<string, { runs: number; requests: number; failures: number }>;
  };
  baseline: { chaos: boolean; driver: boolean; overall: boolean };
  requestTail: { size: number; capacity: number };
  scenariosAvailable: string[];
}

export interface RequestTailEntry {
  seq: number;
  at: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  chaos?: string[];
}

// --- docs engine ------------------------------------------------------------

export interface SpecVersionSummary {
  id: string;
  label: string;
  createdAt: string;
  publishedAt: string | null;
  active: boolean;
}

export interface SpecVersion extends SpecVersionSummary {
  spec: Record<string, unknown>;
}

export interface Guide {
  slug: string;
  title: string;
  markdown: string;
  published: boolean;
  order: number;
  updatedAt: string;
}

export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  markdown: string;
  published: boolean;
  updatedAt: string;
}

export interface DocsStatus {
  enabled: true;
  authMode: 'public' | 'required';
  databaseFile: string;
  contentDir: string;
  chaosOptIn: boolean;
  counts: { specVersions: number; guides: number; changelog: number };
  activeSpec: SpecVersionSummary | null;
  migrations: string[];
}

export interface SeedResult {
  specVersions: number;
  guides: number;
  changelog: number;
  activeSpec: string | null;
  contentDir: string;
  found: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const CONTROL_BASE = '/__control';

async function call<T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res: Response = await fetch(`${CONTROL_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const text = await res.text();
  const parsed: unknown = ((): unknown => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return { message: text };
    }
  })();

  if (!res.ok) {
    const payload = parsed as { message?: string; errors?: Record<string, string> } | null;
    const detail = payload?.errors
      ? Object.entries(payload.errors)
          .map(([field, msg]) => `${field} ${msg}`)
          .join(', ')
      : (payload?.message ?? res.statusText);
    throw new ApiError(res.status, detail);
  }

  return parsed as T;
}

export const api = {
  brand: async (): Promise<Brand> => {
    const res = await fetch('/__admin/brand');
    if (!res.ok) throw new ApiError(res.status, 'could not load service metadata');
    return (await res.json()) as Brand;
  },
  state: (token: string) => call<ControlState>(token, '/state'),
  scenarios: (token: string) =>
    call<{ scenarios: ScenarioListing[] }>(token, '/scenarios').then((r) => r.scenarios),
  requests: (token: string, limit = 50) =>
    call<{ requests: RequestTailEntry[] }>(token, `/requests?limit=${limit}`).then(
      (r) => r.requests,
    ),
  activate: (token: string, body: { scenario: string; params?: unknown; ttlSeconds: number }) =>
    call<ControlState>(token, '/scenario', { method: 'POST', body }),
  driver: (token: string, body: { mode: string; multiplier?: number; ttlSeconds: number }) =>
    call<ControlState>(token, '/driver', { method: 'POST', body }),
  reset: (token: string) => call<ControlState>(token, '/reset', { method: 'POST' }),

  docs: {
    status: (token: string) => call<DocsStatus>(token, '/docs'),
    resetDocs: (token: string) => call<SeedResult>(token, '/reset-docs', { method: 'POST' }),
    preview: (token: string, markdown: string) =>
      call<{ html: string }>(token, '/docs/preview', { method: 'POST', body: { markdown } }),

    specVersions: (token: string) =>
      call<{ specVersions: SpecVersionSummary[] }>(token, '/docs/spec-versions').then(
        (r) => r.specVersions,
      ),
    specVersion: (token: string, id: string) =>
      call<SpecVersion>(token, `/docs/spec-versions/${encodeURIComponent(id)}`),
    createSpecVersion: (
      token: string,
      body: { label: string; spec?: string; fromActive?: boolean },
    ) => call<SpecVersion>(token, '/docs/spec-versions', { method: 'POST', body }),
    updateSpecVersion: (token: string, id: string, body: { label?: string; spec?: string }) =>
      call<SpecVersion>(token, `/docs/spec-versions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body,
      }),
    publishSpecVersion: (token: string, id: string) =>
      call<SpecVersion>(token, `/docs/spec-versions/${encodeURIComponent(id)}/publish`, {
        method: 'POST',
      }),
    deleteSpecVersion: (token: string, id: string) =>
      call<{ deleted: string }>(token, `/docs/spec-versions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),

    guides: (token: string) =>
      call<{ guides: Guide[] }>(token, '/docs/guides').then((r) => r.guides),
    saveGuide: (
      token: string,
      slug: string,
      body: { title: string; markdown: string; published: boolean; order?: number },
    ) =>
      call<Guide>(token, `/docs/guides/${encodeURIComponent(slug)}`, { method: 'PUT', body }),
    deleteGuide: (token: string, slug: string) =>
      call<{ deleted: string }>(token, `/docs/guides/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      }),

    changelog: (token: string) =>
      call<{ changelog: ChangelogEntry[] }>(token, '/docs/changelog').then((r) => r.changelog),
    saveChangelogEntry: (
      token: string,
      id: string,
      body: { date: string; title: string; markdown: string; published: boolean },
    ) =>
      call<ChangelogEntry>(token, `/docs/changelog/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body,
      }),
    deleteChangelogEntry: (token: string, id: string) =>
      call<{ deleted: string }>(token, `/docs/changelog/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
};
