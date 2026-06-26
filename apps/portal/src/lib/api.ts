import type {
  AuditLog,
  ClusterOverview,
  Environment,
  MetricSeries,
  PipelineRun,
  Service,
  Team,
  Template,
  User,
} from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const TOKEN_KEY = 'idp.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    let body: { error?: string; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      /* noop */
    }
    throw new ApiError(res.status, body.error ?? res.statusText, body.details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // ── Auth ──
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: User }>('/api/auth/me'),

  // ── Catalog ──
  templates: () => request<{ templates: Template[] }>('/api/catalog/templates'),
  teams: () => request<{ teams: Team[] }>('/api/catalog/teams'),

  // ── Services ──
  services: () => request<{ services: Service[] }>('/api/services'),
  service: (id: string) => request<{ service: Service }>(`/api/services/${id}`),
  createService: (input: CreateServiceInput) =>
    request<{ service: Service }>('/api/services', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteService: (id: string) =>
    request<{ status: string }>(`/api/services/${id}`, { method: 'DELETE' }),
  servicePipelines: (id: string) =>
    request<{ pipelineRuns: PipelineRun[] }>(`/api/services/${id}/pipelines`),

  // ── Environments ──
  environment: (id: string) => request<{ environment: Environment }>(`/api/environments/${id}`),
  deploy: (id: string, ref?: string) =>
    request<{ pipelineRun: PipelineRun }>(`/api/environments/${id}/deploy`, {
      method: 'POST',
      body: JSON.stringify({ ref }),
    }),
  reconcile: (id: string) =>
    request<{ status: string }>(`/api/environments/${id}/reconcile`, { method: 'POST' }),
  rollback: (id: string, deploymentId?: string) =>
    request<{ deployment: unknown }>(`/api/environments/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ deploymentId }),
    }),
  metrics: (id: string, range = '30m') =>
    request<MetricSeries>(`/api/environments/${id}/metrics?range=${range}`),
  manifest: (id: string) => request<{ manifest: unknown }>(`/api/environments/${id}/manifest`),

  // ── Pipelines ──
  pipeline: (id: string) => request<{ pipelineRun: PipelineRun }>(`/api/pipelines/${id}`),

  // ── Admin ──
  adminCluster: () => request<ClusterOverview>('/api/admin/cluster'),
  adminAudit: (limit = 100) => request<{ logs: AuditLog[] }>(`/api/admin/audit?limit=${limit}`),
};

export interface CreateServiceInput {
  name: string;
  description?: string;
  repoUrl: string;
  defaultBranch?: string;
  template: string;
  containerPort: number;
  teamId?: string;
  environments: string[];
}
