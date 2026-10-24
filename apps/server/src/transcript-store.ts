import type {
  ExecutionKey,
  MissionEvent,
  TranscriptEntry,
  TranscriptSection,
} from '@suptron/runtime';

type EntryBody = TranscriptEntry extends infer E
  ? E extends { id: string; at: string }
    ? Omit<E, 'id' | 'at'>
    : never
  : never;

export const SECTION_KEEP = 200;

interface MissionTranscript {
  sections: TranscriptSection[];
}

/**
 * Transcripts in memory, one list of sections per Mission: a section opens on every
 * `slot.started`; earlier sections are trimmed to their last entries, counting what was dropped.
 */
export class TranscriptStore {
  private readonly missions = new Map<string, MissionTranscript>();

  constructor(
    private readonly keep = SECTION_KEEP,
    private readonly now: () => Date = () => new Date(),
  ) {}

  sections(missionId: string): TranscriptSection[] {
    return this.missions.get(missionId)?.sections ?? [];
  }

  remove(missionId: string): void {
    this.missions.delete(missionId);
  }

  apply(event: MissionEvent): void {
    switch (event.type) {
      case 'slot.started': {
        const transcript = this.transcript(event.missionId);
        for (const section of transcript.sections) this.trim(section);
        const execution: ExecutionKey = {
          slot: event.slot,
          attempt: event.attempt,
          ...(event.loopIteration !== undefined && { loopIteration: event.loopIteration }),
          ...(event.loopFrom !== undefined && { loopFrom: event.loopFrom }),
        };
        const section: TranscriptSection = { execution, entries: [], dropped: 0 };
        if (event.note !== undefined) {
          section.entries.push(this.entry(event, { kind: 'note', text: event.note }));
        }
        transcript.sections.push(section);
        return;
      }
      case 'agent.text':
        return this.append(event, { kind: 'text', text: event.payload.text });
      case 'agent.tool_call':
        return this.append(event, {
          kind: 'tool_call',
          toolCallId: event.payload.id,
          name: event.payload.name,
          input: event.payload.input,
        });
      case 'agent.tool_result': {
        const section = this.current(event.missionId);
        const call = section?.entries.find(
          (e) => e.kind === 'tool_call' && e.toolCallId === event.payload.toolCallId,
        );
        if (call && call.kind === 'tool_call') {
          call.result = { output: event.payload.output, isError: event.payload.isError };
          return;
        }
        // A result whose call was trimmed away or never seen: keep it as its own row.
        return this.append(event, {
          kind: 'tool_call',
          toolCallId: event.payload.toolCallId,
          name: '(result)',
          input: null,
          result: { output: event.payload.output, isError: event.payload.isError },
        });
      }
      case 'agent.error':
        return this.append(event, { kind: 'error', message: event.payload.message });
      case 'check.evaluated':
        return this.append(event, {
          kind: 'check',
          check: event.check,
          holds: event.holds,
          detail: event.detail,
        });
      case 'question.asked':
        return this.append(event, {
          kind: 'question',
          questionId: event.questionId,
          questions: event.questions,
        });
      case 'question.answered':
        return this.append(event, {
          kind: 'answer',
          questionId: event.questionId,
          answers: event.answers,
        });
      case 'mission.dismissed':
        this.remove(event.missionId);
        return;
      default:
        return;
    }
  }

  private transcript(missionId: string): MissionTranscript {
    let transcript = this.missions.get(missionId);
    if (!transcript) {
      transcript = { sections: [] };
      this.missions.set(missionId, transcript);
    }
    return transcript;
  }

  private current(missionId: string): TranscriptSection | undefined {
    return this.missions.get(missionId)?.sections.at(-1);
  }

  private entry(event: MissionEvent, body: EntryBody): TranscriptEntry {
    return {
      id: `${event.missionId}:${event.seq}`,
      at: this.now().toISOString(),
      ...body,
    } as TranscriptEntry;
  }

  private append(event: MissionEvent, body: EntryBody): void {
    const section = this.current(event.missionId);
    if (!section) return;
    section.entries.push(this.entry(event, body));
  }

  private trim(section: TranscriptSection): void {
    if (section.entries.length <= this.keep) return;
    const excess = section.entries.length - this.keep;
    section.entries.splice(0, excess);
    section.dropped += excess;
  }
}
