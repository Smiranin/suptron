import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Issue } from './schemas.js';
import { issuesFromZod, unitFileSchema, type UnitFile } from './schemas.js';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const SECTION_HEADING = /^## (.+?)\s*$/;

export type ParsedUnit = { unit: UnitFile; issues: Issue[] } | { unit: null; issues: Issue[] };

/** Splits a Markdown body into its second-level sections, keeping their order. */
function splitSections(body: string): { title: string; text: string }[] {
  const sections: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;
  const preamble: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const heading = SECTION_HEADING.exec(line);
    if (heading) {
      current = { title: heading[1]!, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  const result = sections.map((s) => ({ title: s.title, text: s.lines.join('\n').trim() }));
  if (preamble.join('').trim()) result.unshift({ title: '', text: preamble.join('\n').trim() });
  return result;
}

/**
 * Parses a Unit file: YAML frontmatter followed by exactly the sections `## Rules` and
 * `## Instructions`. Every problem is reported as an Issue instead of an exception.
 */
export function parseUnitMarkdown(text: string): ParsedUnit {
  const match = FRONTMATTER.exec(text);
  if (!match) {
    return {
      unit: null,
      issues: [
        { code: 'missing_frontmatter', message: 'The file must start with YAML frontmatter' },
      ],
    };
  }
  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(match[1]!) ?? {};
  } catch (error) {
    return {
      unit: null,
      issues: [
        { code: 'invalid_yaml', message: `Frontmatter is not valid YAML: ${String(error)}` },
      ],
    };
  }
  const sections = splitSections(match[2]!);
  const issues: Issue[] = [];
  const titles = sections.map((s) => s.title);
  const expected = ['Rules', 'Instructions'];
  if (titles.join('|') !== expected.join('|')) {
    issues.push({
      code: 'invalid_sections',
      message: `The body must contain exactly the sections "## Rules" and "## Instructions" in that order (found: ${
        titles
          .filter(Boolean)
          .map((t) => `"## ${t}"`)
          .join(', ') || 'none'
      })`,
    });
  }
  const rules = sections.find((s) => s.title === 'Rules')?.text ?? '';
  const instructions = sections.find((s) => s.title === 'Instructions')?.text ?? '';
  const parsed = unitFileSchema.safeParse({
    ...(typeof frontmatter === 'object' && frontmatter ? frontmatter : {}),
    rules,
    instructions,
  });
  if (!parsed.success) issues.push(...issuesFromZod(parsed.error));
  if (issues.length > 0 || !parsed.success) return { unit: null, issues };
  return { unit: parsed.data, issues: [] };
}

/** Canonical Unit text: frontmatter in fixed key order, then the two sections. */
export function formatUnitMarkdown(
  frontmatter: Record<string, unknown>,
  rules: string,
  instructions: string,
): string {
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 });
  return `---\n${yaml}---\n\n## Rules\n\n${rules.trim()}\n\n## Instructions\n\n${instructions.trim()}\n`;
}
