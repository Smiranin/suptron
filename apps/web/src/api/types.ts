import type {
  AssemblyFile,
  AssemblyStatus,
  Issue,
  ProfileFile,
  UnitFile,
} from '@suptron/runtime/browser';

export interface UnitItem {
  name: string;
  unit: UnitFile | null;
  etag: string;
  issues: Issue[];
}

export interface UnitUsage {
  assemblies: { project: string; assembly: string }[];
  activeMissions: number;
}

export interface UnitDetail extends UnitItem {
  usage: UnitUsage;
}

export interface AssemblyItem {
  name: string;
  status: AssemblyStatus;
  issues: { errors: Issue[]; warnings: Issue[] };
  activeMissions: number;
}

export interface ProjectItem {
  name: string;
  profile: ProfileFile | null;
  etag: string;
  issues: Issue[];
  assemblies: AssemblyItem[];
  activeMissions: number;
}

export interface AssemblyDetail {
  name: string;
  assembly: AssemblyFile | null;
  text?: string;
  etag: string;
  status: AssemblyStatus;
  issues: { errors: Issue[]; warnings: Issue[] };
  activeMissions: number;
}

export interface CheckoutItem {
  path: string;
  branch: string | null;
  isMainWorktree: boolean;
  busyMissionId: string | null;
}

export interface ModelItem {
  id: string;
  displayName: string;
}

export interface HealthInfo {
  engine: { ok: boolean; reason?: string };
  host: { ok: boolean; reason?: string };
  configHome: string;
}

export interface RemoteDefaults {
  remote: string;
  remoteUrl: string | null;
  headBranch: string | null;
}

export interface FsStat {
  exists: boolean;
  kind?: 'file' | 'dir';
  path?: string;
}
