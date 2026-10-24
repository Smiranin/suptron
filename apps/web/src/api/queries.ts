import type { AssemblyFile, ProfileFile, UnitFile } from '@suptron/runtime/browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './client';
import type {
  AssemblyDetail,
  CheckoutItem,
  FsStat,
  HealthInfo,
  ModelItem,
  ProjectItem,
  RemoteDefaults,
  UnitDetail,
  UnitItem,
} from './types';

export const keys = {
  health: ['health'] as const,
  models: ['models'] as const,
  units: ['units'] as const,
  unit: (name: string) => ['units', name] as const,
  projects: ['projects'] as const,
  project: (name: string) => ['projects', name] as const,
  assembly: (project: string, name: string) => ['projects', project, 'assemblies', name] as const,
  checkouts: (project: string) => ['projects', project, 'checkouts'] as const,
  fsStat: (path: string, base?: string) => ['fs', path, base ?? ''] as const,
  remoteDefaults: (path: string) => ['git', path] as const,
};

export const api = {
  health: () => request<HealthInfo>('/api/health'),
  models: () => request<ModelItem[]>('/api/models'),
  units: () => request<{ items: UnitItem[] }>('/api/units').then((r) => r.items),
  unit: (name: string) => request<UnitDetail>(`/api/units/${encodeURIComponent(name)}`),
  putUnit: (name: string, unit: UnitFile, options: { etag?: string; force?: boolean } = {}) =>
    request<{ unit: UnitFile; etag: string }>(`/api/units/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: unit,
      ...options,
    }),
  deleteUnit: (name: string) =>
    request<void>(`/api/units/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  duplicateUnit: (name: string, newName: string) =>
    request<{ unit: UnitFile; etag: string }>(`/api/units/${encodeURIComponent(name)}/duplicate`, {
      method: 'POST',
      body: { newName },
    }),
  projects: () => request<{ items: ProjectItem[] }>('/api/projects').then((r) => r.items),
  project: (name: string) => request<ProjectItem>(`/api/projects/${encodeURIComponent(name)}`),
  createProject: (profile: ProfileFile) =>
    request<{ profile: ProfileFile; etag: string }>('/api/projects', {
      method: 'POST',
      body: { profile },
    }),
  putProfile: (
    project: string,
    profile: ProfileFile,
    options: { etag?: string; force?: boolean } = {},
  ) =>
    request<{ profile: ProfileFile; etag: string }>(
      `/api/projects/${encodeURIComponent(project)}/profile`,
      { method: 'PUT', body: profile, ...options },
    ),
  deleteProject: (name: string) =>
    request<void>(`/api/projects/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  checkouts: (project: string) =>
    request<CheckoutItem[]>(`/api/projects/${encodeURIComponent(project)}/checkouts`),
  assembly: (project: string, name: string) =>
    request<AssemblyDetail>(
      `/api/projects/${encodeURIComponent(project)}/assemblies/${encodeURIComponent(name)}`,
    ),
  putAssembly: (
    project: string,
    name: string,
    assembly: AssemblyFile,
    options: { etag?: string; force?: boolean } = {},
  ) =>
    request<{
      assembly: AssemblyFile;
      etag: string;
      warnings: { code: string; message: string; slotName?: string }[];
    }>(`/api/projects/${encodeURIComponent(project)}/assemblies/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: assembly,
      ...options,
    }),
  deleteAssembly: (project: string, name: string) =>
    request<void>(
      `/api/projects/${encodeURIComponent(project)}/assemblies/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),
  duplicateAssembly: (project: string, name: string, newName: string) =>
    request<{ assembly: AssemblyFile; etag: string }>(
      `/api/projects/${encodeURIComponent(project)}/assemblies/${encodeURIComponent(name)}/duplicate`,
      { method: 'POST', body: { newName } },
    ),
  open: (path: string) => request<void>('/api/open', { method: 'POST', body: { path } }),
  remoteDefaults: (path: string) =>
    request<RemoteDefaults>(`/api/git/remote-defaults?path=${encodeURIComponent(path)}`),
  fsStat: (path: string, base?: string) =>
    request<FsStat>(
      `/api/fs/stat?path=${encodeURIComponent(path)}${base ? `&base=${encodeURIComponent(base)}` : ''}`,
    ),
};

export function useHealth() {
  return useQuery({ queryKey: keys.health, queryFn: api.health, staleTime: 30_000 });
}

export function useModels() {
  return useQuery({ queryKey: keys.models, queryFn: api.models, staleTime: 60_000, retry: false });
}

export function useUnits() {
  return useQuery({ queryKey: keys.units, queryFn: api.units });
}

export function useUnit(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.unit(name),
    queryFn: () => api.unit(name),
    enabled,
    retry: false,
  });
}

export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: api.projects });
}

export function useProject(name: string) {
  return useQuery({ queryKey: keys.project(name), queryFn: () => api.project(name), retry: false });
}

export function useAssembly(project: string, name: string, enabled = true) {
  return useQuery({
    queryKey: keys.assembly(project, name),
    queryFn: () => api.assembly(project, name),
    enabled,
    retry: false,
  });
}

export function useCheckouts(project: string, enabled = true) {
  return useQuery({
    queryKey: keys.checkouts(project),
    queryFn: () => api.checkouts(project),
    enabled,
    retry: false,
  });
}

export function useFsStat(path: string, base?: string) {
  return useQuery({
    queryKey: keys.fsStat(path, base),
    queryFn: () => api.fsStat(path, base),
    enabled: path.trim() !== '',
    retry: false,
    staleTime: 5_000,
  });
}

export function useRemoteDefaults(path: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.remoteDefaults(path),
    queryFn: () => api.remoteDefaults(path),
    enabled: enabled && path.trim() !== '',
    retry: false,
  });
}

/** Invalidates everything that lists or reads configuration after a write. */
export function useInvalidateConfig() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.units }),
      client.invalidateQueries({ queryKey: keys.projects }),
    ]);
}

export function useConfigMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const invalidate = useInvalidateConfig();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidate(),
  });
}
