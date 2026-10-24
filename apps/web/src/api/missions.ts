import type { MissionDetail, MissionSummary, MissionTask } from '@suptron/runtime/browser';
import { HttpError, NotFoundError, request } from './client';

export type StartIssueField = 'taskPath' | 'taskText' | 'checkoutPath' | 'assembly' | 'workItemId';

export class MissionValidationError extends Error {
  constructor(readonly issues: { field: StartIssueField; message: string }[]) {
    super(issues.map((i) => i.message).join('; '));
    this.name = 'MissionValidationError';
  }
}

export class CheckoutBusyError extends Error {
  constructor(readonly missionId: string) {
    super('The Checkout is busy with another Mission');
    this.name = 'CheckoutBusyError';
  }
}

export interface StartMissionRequest {
  project: string;
  assembly: string;
  task: MissionTask;
  workItemId?: string;
  checkoutPath: string;
  mayAskCommander: Record<string, boolean>;
}

export const missionsApi = {
  list: () => request<MissionSummary[]>('/api/missions'),
  get: (id: string) => request<MissionDetail>(`/api/missions/${encodeURIComponent(id)}`),
  async start(body: StartMissionRequest): Promise<MissionSummary> {
    try {
      return await request<MissionSummary>('/api/missions', { method: 'POST', body });
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        const payload = error.body as { missionId?: string } | undefined;
        throw new CheckoutBusyError(payload?.missionId ?? '');
      }
      if (error && typeof error === 'object' && 'issues' in error) {
        const issues = (error as { issues: { field: StartIssueField; message: string }[] }).issues;
        throw new MissionValidationError(issues);
      }
      throw error;
    }
  },
  stop: (id: string) =>
    request<void>(`/api/missions/${encodeURIComponent(id)}/stop`, { method: 'POST' }),
  retry: (id: string, note: string) =>
    request<void>(`/api/missions/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
      body: { note },
    }),
  answer: (id: string, questionId: string, answers: Record<string, string>) =>
    request<void>(`/api/missions/${encodeURIComponent(id)}/answer`, {
      method: 'POST',
      body: { questionId, answers },
    }),
  dismiss: (id: string) =>
    request<void>(`/api/missions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export { NotFoundError };
