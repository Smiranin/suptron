import { DEFAULTS, type AssemblyFile } from '@suptron/runtime/browser';
import { Input } from '@suptron/ui/components/input';
import { Label } from '@suptron/ui/components/label';
import { CollapsibleSection } from '../../../components/collapsible-section';
import { LimitField } from '../../../components/limit-field';
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
  /**
   * A limit equal to its default is shown as the placeholder, the way the file leaves it out;
   * an emptied field clears the value, so the default applies.
   */
  const limit = (key: 'defaultAttemptLimit' | 'defaultLoopLimit' | 'resolutionLimit') => ({
    value: core[key] === DEFAULTS.core[key] ? undefined : core[key],
    defaultValue: DEFAULTS.core[key],
    onChange: (value: number | undefined) =>
      dispatch({ type: 'patchCore', patch: { [key]: value } }),
  });
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
          <LimitField id="core-attempts" min={1} {...limit('defaultAttemptLimit')} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="core-loops">Default Loop limit</Label>
          <LimitField id="core-loops" min={1} {...limit('defaultLoopLimit')} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="core-resolutions">Core decision limit</Label>
        <LimitField id="core-resolutions" min={0} {...limit('resolutionLimit')} />
        <p className="text-muted-foreground text-xs">
          How many times per Slot the Core decides in your place: one more Attempt (at a Loop limit,
          one more round) with its own note, or the result accepted with open points. After that it
          has the final word: accept, or Needs Attention. 0: every such point waits for you.
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
