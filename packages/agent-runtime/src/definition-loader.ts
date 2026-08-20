import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface ParsedAgentDefinition {
  agentId: string;
  name: string;
  description: string;
  identity: string;
  mission: string[];
  criticalRules: string[];
  deliverables: string[];
  successMetrics: string[];
  needsInput: string[];
  sourcePath: string;
  sourceRevision: string;
  version: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function extractFrontMatter(
  source: string,
): Record<string, string> {
  const match = source.match(
    /^---\n([\s\S]*?)\n---(?:\n|$)/,
  );

  if (!match) {
    return {};
  }

  const result: Record<string, string> = {};

  const body = match[1] ?? '';

  for (const line of body.split('\n')) {
    const separator = line.indexOf(':');

    if (separator < 1) {
      continue;
    }

    const key = line
      .slice(0, separator)
      .trim();

    let value = line
      .slice(separator + 1)
      .trim();

    value = value.replace(/^['"]|['"]$/g, '');

    result[key] = value;
  }

  return result;
}

function extractSection(
  source: string,
  heading: string,
): string {
  const escapedHeading =
    heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const expression = new RegExp(
    `^## ${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s|$)`,
    'im',
  );

  const match = source.match(expression);

  return match
    ? normalizeWhitespace(match[1] ?? '')
    : '';
}

function extractBulletList(
  section: string,
): string[] {
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) =>
      line
        .replace(/^[-*]\s+/, '')
        .trim(),
    )
    .filter(Boolean);
}

function extractNeedsInput(
  source: string,
): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) =>
      line.includes('[NEEDS INPUT'),
    )
    .map((line) =>
      line
        .replace(/^[-*]\s*/, '')
        .trim(),
    )
    .filter(Boolean);
}

function deriveAgentId(
  sourcePath: string,
  frontMatter: Record<string, string>,
): string {
  if (frontMatter.agent_id) {
    return frontMatter.agent_id;
  }

  return sourcePath
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function loadAgentDefinition(
  relativeSourcePath: string,
): Promise<ParsedAgentDefinition> {
  const normalizedSourcePath =
    relativeSourcePath.replace(/\\/g, '/');

  const sourcePath = resolve(
    process.cwd(),
    ...normalizedSourcePath.split('/'),
  );

  const raw = await readFile(
    sourcePath,
    'utf8',
  );

  const frontMatter =
    extractFrontMatter(raw);

  const name =
    frontMatter.name ??
    raw.match(/^#\s+(.+)$/m)?.[1]?.trim();

  if (!name) {
    throw new Error(
      `Agent definition is missing a name: ${relativeSourcePath}`,
    );
  }

  const description =
    frontMatter.description ?? '';

  const identity =
    extractSection(raw, 'Identity');

  const coreMission =
    extractSection(raw, 'Core Mission');

  const criticalRules =
    extractSection(raw, 'Critical Rules');

  const deliverables =
    extractSection(raw, 'Deliverables');

  const successMetrics =
    extractSection(raw, 'Success Metrics');

  const sourceRevision =
    createHash('sha256')
      .update(raw)
      .digest('hex');

  return {
    agentId: deriveAgentId(
      normalizedSourcePath,
      frontMatter,
    ),

    name,

    description,

    identity,

    mission:
      extractBulletList(
        coreMission,
      ),

    criticalRules:
      extractBulletList(
        criticalRules,
      ),

    deliverables:
      extractBulletList(
        deliverables,
      ),

    successMetrics:
      extractBulletList(
        successMetrics,
      ),

    needsInput:
      extractNeedsInput(raw),

    sourcePath:
      normalizedSourcePath,

    sourceRevision,

    version:
      `sha256:${sourceRevision.slice(0, 16)}`,
  };
}