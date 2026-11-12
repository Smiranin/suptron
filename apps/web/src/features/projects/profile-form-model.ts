import {
  DEFAULTS,
  profileFileSchema,
  type ProfileFile,
  type WorkspaceFile,
  type WorkspaceKind,
} from '@suptron/runtime/browser';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver, type UseFormReturn } from 'react-hook-form';
import { withRequiredTitle } from '../../components/title-id-fields';

/**
 * The form holds the Profile with every kind's fields optional, so react-hook-form can address
 * `workspace.path` whatever the kind; the zod resolver turns it back into the discriminated
 * `ProfileFile` on submit and rejects fields of another kind (SPEC FR-1).
 */
export interface ProfileFormValues {
  name: string;
  title?: string;
  workspace: {
    kind: WorkspaceKind;
    path?: string;
    remote?: string;
    protectedBranch?: string;
    host?: 'github' | 'none';
    git?: {
      branchNameTemplate?: string;
      pullRequestTemplate?: string;
      labels?: string[];
      reviewers?: string[];
    };
    ciWaitTimeoutMinutes?: number;
  };
  knowledgeSources: { path?: string; text?: string; title?: string }[];
  engine: 'claude-code';
}

export type ProfileFormHandle = UseFormReturn<ProfileFormValues, unknown, ProfileFile>;

/** The fields of a kind with their defaults, when the Commander picks it (FR-3). */
export function emptyWorkspace(kind: WorkspaceKind): WorkspaceFile {
  switch (kind) {
    case 'none':
      return { kind: 'none' };
    case 'folder':
      return { kind: 'folder', path: '' };
    case 'repository':
      return {
        kind: 'repository',
        path: '',
        remote: DEFAULTS.profile.repository.remote,
        protectedBranch: DEFAULTS.profile.repository.protectedBranch,
        host: DEFAULTS.profile.repository.host,
        // Empty conventions: the form shows examples, the Pilots decide unless the Commander sets one.
        git: {
          branchNameTemplate: DEFAULTS.profile.repository.git.branchNameTemplate,
          pullRequestTemplate: DEFAULTS.profile.repository.git.pullRequestTemplate,
          labels: [],
          reviewers: [],
        },
        ciWaitTimeoutMinutes: DEFAULTS.profile.repository.ciWaitTimeoutMinutes,
      };
  }
}

export function emptyProfile(kind: WorkspaceKind = 'repository', name = ''): ProfileFile {
  return {
    name,
    title: name,
    workspace: emptyWorkspace(kind),
    knowledgeSources: [],
    engine: 'claude-code',
  };
}

/** A Profile as the form edits it: a file written before titles existed shows its name as title. */
export function profileForForm(profile: ProfileFile): ProfileFile {
  return { ...profile, title: profile.title ?? profile.name };
}

export function useProfileForm(defaultValues: ProfileFile): ProfileFormHandle {
  return useForm<ProfileFormValues, unknown, ProfileFile>({
    // The schema's input type is the union; the form's is its widened shape (see ProfileFormValues).
    resolver: withRequiredTitle(
      zodResolver(profileFileSchema) as unknown as Resolver<
        ProfileFormValues,
        unknown,
        ProfileFile
      >,
    ),
    defaultValues,
    mode: 'onChange',
  });
}
