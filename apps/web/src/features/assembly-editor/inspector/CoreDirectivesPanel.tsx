import { DEFAULTS, type AssemblyFile } from '@suptron/runtime/browser';
import { Input } from '@suptron/ui/components/input';
import { Label } from '@suptron/ui/components/label';
import { MarkdownField } from '../../../components/markdown-field';
import { ModelSelect } from '../../../components/model-select';
import type { Command } from '../model/reducer';

/** The Core Directives: model, limits and the free-text instructions (FR-19). */
export function CoreDirectivesPanel({
  doc,
  dispatch,
}: {
  doc: AssemblyFile;
  dispatch: (cmd: Command) => void;
}) {
  const core = doc.core;
  const number = (key: 'defaultAttemptLimit' | 'defaultLoopLimit', raw: string) => {
    const value = Number(raw);
    dispatch({
      type: 'patchCore',
      patch: {
        [key]:
          raw.trim() === '' || !Number.isFinite(value) || value < 1 ? undefined : Math.floor(value),
      },
    });
  };
  return (
    <div className="flex flex-col gap-4" data-testid="core-panel">
      <h2 className="text-lg font-bold">Core Directives</h2>
      <div className="flex flex-col gap-1">
        <Label htmlFor="core-model">Core model</Label>
        <ModelSelect
          id="core-model"
          value={core.model}
          onChange={(model) => dispatch({ type: 'patchCore', patch: { model } })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="core-attempts">Default Attempt limit</Label>
          <Input
            id="core-attempts"
            type="number"
            min={1}
            value={core.defaultAttemptLimit ?? DEFAULTS.core.defaultAttemptLimit}
            onChange={(e) => number('defaultAttemptLimit', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="core-loops">Default Loop limit</Label>
          <Input
            id="core-loops"
            type="number"
            min={1}
            value={core.defaultLoopLimit ?? DEFAULTS.core.defaultLoopLimit}
            onChange={(e) => number('defaultLoopLimit', e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="core-instructions">Instructions</Label>
        <p className="text-muted-foreground text-xs">
          How to compose context, judge Checks, when to go to Needs Attention and how to report.
        </p>
        <MarkdownField
          id="core-instructions"
          value={core.instructions ?? ''}
          onChange={(e) => dispatch({ type: 'patchCore', patch: { instructions: e.target.value } })}
        />
      </div>
    </div>
  );
}
