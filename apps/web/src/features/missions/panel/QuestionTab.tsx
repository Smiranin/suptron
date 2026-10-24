import type { Question } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { Checkbox } from '@suptron/ui/components/checkbox';
import { Input } from '@suptron/ui/components/input';
import { Label } from '@suptron/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@suptron/ui/components/radio-group';
import { toast } from '@suptron/ui/components/sonner';
import { useState } from 'react';
import { missionsApi } from '../../../api/missions';
import type { ReadyMissionState } from '../model/types';

interface Draft {
  chosen: string[];
  other: string;
}

/** Assembles `Record<question, string>`: chosen labels joined with ", ", or the free answer. */
export function answersOf(
  questions: Question[],
  drafts: Record<string, Draft>,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of questions) {
    const draft = drafts[question.question] ?? { chosen: [], other: '' };
    answers[question.question] =
      draft.other.trim() !== '' ? draft.other.trim() : draft.chosen.join(', ');
  }
  return answers;
}

/** Every question of the checkpoint with its options and an "Other" field; one Answer button (FR-25, FR-26). */
export function QuestionTab({ state }: { state: ReadyMissionState }) {
  const pending = state.pendingQuestion;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sending, setSending] = useState(false);
  if (!pending) return null;
  const update = (question: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [question]: { chosen: [], other: '', ...d[question], ...patch } }));
  const answers = answersOf(pending.questions, drafts);
  const complete = pending.questions.every((q) => answers[q.question] !== '');
  const submit = async () => {
    setSending(true);
    try {
      await missionsApi.answer(state.summary.id, pending.id, answers);
    } catch (error) {
      toast.error(`Could not answer: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSending(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-5 p-4"
      data-testid="question-tab"
      onSubmit={(event) => {
        event.preventDefault();
        if (complete) void submit();
      }}
    >
      <p className="text-muted-foreground m-0 text-sm">
        <span className="font-semibold">{pending.slot}</span> is waiting for your answer.
      </p>
      {pending.questions.map((q, index) => {
        const draft = drafts[q.question] ?? { chosen: [], other: '' };
        const otherId = `other-${index}`;
        return (
          <fieldset key={q.question} className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="text-xs font-bold tracking-wider uppercase">{q.header}</legend>
            <p className="m-0 text-sm">{q.question}</p>
            {q.multiSelect ? (
              <div className="flex flex-col gap-2">
                {q.options.map((o) => {
                  const id = `opt-${index}-${o.label}`;
                  return (
                    <div key={o.label} className="flex items-start gap-2">
                      <Checkbox
                        id={id}
                        checked={draft.chosen.includes(o.label)}
                        onCheckedChange={(checked) =>
                          update(q.question, {
                            chosen: checked
                              ? [...draft.chosen, o.label]
                              : draft.chosen.filter((c) => c !== o.label),
                          })
                        }
                      />
                      <Label htmlFor={id} className="flex flex-col items-start gap-0.5">
                        <span>{o.label}</span>
                        {o.description && (
                          <span className="text-muted-foreground text-xs font-normal">
                            {o.description}
                          </span>
                        )}
                      </Label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <RadioGroup
                value={draft.chosen[0] ?? ''}
                onValueChange={(value) => update(q.question, { chosen: [value] })}
              >
                {q.options.map((o) => {
                  const id = `opt-${index}-${o.label}`;
                  return (
                    <div key={o.label} className="flex items-start gap-2">
                      <RadioGroupItem id={id} value={o.label} />
                      <Label htmlFor={id} className="flex flex-col items-start gap-0.5">
                        <span>{o.label}</span>
                        {o.description && (
                          <span className="text-muted-foreground text-xs font-normal">
                            {o.description}
                          </span>
                        )}
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            )}
            <div className="flex flex-col gap-1">
              <Label htmlFor={otherId} className="text-muted-foreground text-xs">
                Other
              </Label>
              <Input
                id={otherId}
                value={draft.other}
                onChange={(e) => update(q.question, { other: e.target.value })}
                placeholder="A free answer"
              />
            </div>
          </fieldset>
        );
      })}
      <Button type="submit" disabled={!complete || sending}>
        {sending ? 'Answering…' : 'Answer'}
      </Button>
    </form>
  );
}
