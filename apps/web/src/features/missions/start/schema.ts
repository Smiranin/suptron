import { MISSION_TITLE_MAX_LENGTH } from '@suptron/runtime/browser';
import { z } from 'zod';

export const startMissionTaskSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), path: z.string().min(1, 'A Task location is required') }),
  z.object({ kind: z.literal('text'), text: z.string().trim().min(1, 'The Task text is empty') }),
]);

export const startMissionSchema = z.object({
  /** Required for a repository Project; absent otherwise. */
  checkoutPath: z.string().min(1, 'Pick a Checkout').optional(),
  task: startMissionTaskSchema,
  /** Empty: the Project name and the date. */
  title: z.string().trim().max(MISSION_TITLE_MAX_LENGTH).optional(),
  workItemId: z.string().trim().optional(),
  mayAskCommander: z.record(z.string(), z.boolean()),
});

export type StartMissionForm = z.infer<typeof startMissionSchema>;
