import { DEFAULTS, type AssemblyFile } from '@suptron/runtime/browser';
import { Input } from '@suptron/ui/components/input';
import { Label } from '@suptron/ui/components/label';
import { CollapsibleSection } from '../../../components/collapsible-section';
import { MarkdownField } from '../../../components/markdown-field';
import { ModelSelect } from '../../../components/model-select';
import { PromptPreview, PromptPreviewButton } from '../../../components/prompt-preview-dialog';
import type { Command } from '../model/reducer';

/** The Assembly's title, then the Core Directives: model, limits and the free-text instructions (FR-19). */
export function CoreDirectivesPanel({
  doc,
  dispatch,
}: {
  doc: AssemblyFile;
  dispatch: (cmd: Command) => void;
}) {
  const core = doc.core;
  /** An empty or out-of-range entry clears the field, so its default applies. */
  const number = (
    key: 'defaultAttemptLimit' | 'defaultLoopLimit' | 'resolutionLimit',
    raw: string,
    min = 1,
  ) => {
    const value = Number(raw);
    dispatch({
      type: 'patchCore',
      patch: {
        [key]:
          raw.trim() === '' || !Number.isFinite(value) || value < min
            ? undefined
            : Math.floor(value),
      },
    });
  };
  return (
    <div className="flex flex-col gap-4" data-testid="core-panel">
      <h2 className="text-lg font-bold">Assembly</h2>
      <div className="flex flex-col gap-1">
        <Label htmlFor="assembly-title">Title</Label>
        <Input
          id="assembly-title"
          value={doc.title ?? ''}
          placeholder={doc.name}
          onChange={(e) => dispatch({ type: 'setTitle', title: e.target.value })}
        />
        <p className="text-muted-foreground text-xs">
          ID <code>{doc.name}</code> is fixed: Missions refer to it.
        </p>
      </div>
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
        <Label htmlFor="core-resolutions">Core decision limit</Label>
        <Input
          id="core-resolutions"
          type="number"
          min={0}
          value={core.resolutionLimit ?? DEFAULTS.core.resolutionLimit}
          onChange={(e) => number('resolutionLimit', e.target.value, 0)}
        />
        <p className="text-muted-foreground text-xs">
          How many times per Slot the Core decides in your place before the Mission goes to Needs
          Attention: one more Attempt with its own note, or a failed judgment accepted as an open
          point. 0: every such point waits for you.
        </p>
      </div>
      <CollapsibleSection title="Built-in directives">
        <PromptPreview request={{ role: 'core', instructions: '' }} />
      </CollapsibleSection>
      <div className="flex flex-col gap-1">
        <Label htmlFor="core-instructions">Additional Instructions</Label>
        <p className="text-muted-foreground text-xs">
          Appended to the built-in directives: how to compose context, judge Checks, when to go to
          Needs Attention and how to report in this Assembly.
        </p>
        <MarkdownField
          id="core-instructions"
          value={core.instructions ?? ''}
          onChange={(e) => dispatch({ type: 'patchCore', patch: { instructions: e.target.value } })}
        />
      </div>
      <div>
        <PromptPreviewButton
          title="Prompt of the Core"
          request={{ role: 'core', instructions: core.instructions ?? '' }}
        />
      </div>
    </div>
  );
}
