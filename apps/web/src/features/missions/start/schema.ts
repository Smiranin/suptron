import { z } from 'zod';

export const startMissionTaskSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), path: z.string().min(1, 'A Task location is required') }),
  z.object({ kind: z.literal('text'), text: z.string().trim().min(1, 'The Task text is empty') }),
]);

export const startMissionSchema = z.object({
  checkoutPath: z.string().min(1, 'Pick a Checkout'),
  task: startMissionTaskSchema,
  workItemId: z.string().trim().optional(),
  mayAskCommander: z.record(z.string(), z.boolean()),
});

export type StartMissionForm = z.infer<typeof startMissionSchema>;
