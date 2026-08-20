import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  AgentDefinition,
  DependencyEdge,
  DependencyKind,
  WorkstreamDefinition,
} from '@platform/contracts';

const agentDirectories = [
  'abm',
  'analytics',
  'client-ops',
  'comms',
  'content',
  'design',
  'developer-marketing',
  'email',
  'events',
  'growth',
  'paid-media',
  'partnerships',
  'product-marketing',
  'project-management',
  'sales',
  'seo',
  'social',
];
const frontmatterPattern = /^---\n([\s\S]*?)\n---\n/;

function findRepositoryRoot(start: string): string {
  let current = start;
  while (current !== dirname(current)) {
    if (existsSync(join(current, 'strategy', 'workstreams'))) return current;
    current = dirname(current);
  }
  return start;
}

export class RegistryValidation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryValidation';
  }
}

function hash(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function metadata(source: string): Record<string, string> {
  const body = source.match(frontmatterPattern)?.[1];
  if (!body) return {};
  return Object.fromEntries(
    body.split('\n').flatMap((line) => {
      const separator = line.indexOf(':');
      if (separator < 1) return [];
      return [
        [
          line.slice(0, separator).trim(),
          line
            .slice(separator + 1)
            .trim()
            .replace(/^['\"]|['\"]$/g, ''),
        ],
      ];
    }),
  );
}

function section(source: string, title: string): string {
  return source.match(new RegExp(`^## ${title}\\n([\\s\\S]*?)(?=^## |$)`, 'm'))?.[1]?.trim() ?? '';
}

function items(source: string, title: string): string[] {
  return section(source, title)
    .split('\n')
    .map((line) => line.replace(/^[-*]\\s+/, '').trim())
    .filter(Boolean);
}

function sourceId(sourcePath: string): string {
  return sourcePath
    .replace(/\\.md$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export class AgentRegistry {
  constructor(private readonly definitions: AgentDefinition[]) {}
  all(): AgentDefinition[] {
    return [...this.definitions];
  }
  get(agentId: string): AgentDefinition {
    const definition = this.definitions.find((item) => item.agentId === agentId);
    if (!definition) throw new RegistryValidation(`Agent not found: ${agentId}`);
    return definition;
  }
}

export class WorkstreamRegistry {
  constructor(private readonly definitions: WorkstreamDefinition[]) {}
  all(): WorkstreamDefinition[] {
    return [...this.definitions];
  }
  get(workstreamId: string): WorkstreamDefinition {
    const definition = this.definitions.find((item) => item.workstreamId === workstreamId);
    if (!definition) throw new RegistryValidation(`Workstream not found: ${workstreamId}`);
    return definition;
  }
}

export class RegistryLoader {
  constructor(
    private readonly repositoryRoot = findRepositoryRoot(process.cwd()),
    private readonly directories = agentDirectories,
  ) {}

  async loadAgents(): Promise<AgentRegistry> {
    const paths: string[] = [];
    for (const directory of this.directories) {
      let entries;
      try {
        entries = await readdir(join(this.repositoryRoot, directory), { withFileTypes: true });
      } catch {
        throw new RegistryValidation(`Declared source directory is missing: ${directory}`);
      }
      paths.push(
        ...entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
          .map((entry) => join(directory, entry.name)),
      );
    }
    if (paths.length === 0) throw new RegistryValidation('No agent sources were discovered');
    const definitions = await Promise.all(paths.sort().map((path) => this.parseAgent(path)));
    const ids = new Set<string>();
    for (const definition of definitions) {
      if (ids.has(definition.agentId))
        throw new RegistryValidation(`Duplicate agent ID: ${definition.agentId}`);
      ids.add(definition.agentId);
    }
    return new AgentRegistry(definitions);
  }

  async loadWorkstreams(): Promise<WorkstreamRegistry> {
    const directory = join(this.repositoryRoot, 'strategy/workstreams');
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      throw new RegistryValidation('Declared source directory is missing: strategy/workstreams');
    }
    const paths = entries
      .filter((entry) => entry.isFile() && /^\d{2}-.*\.md$/.test(entry.name))
      .map((entry) => join('strategy/workstreams', entry.name))
      .sort();
    const definitions = await Promise.all(paths.map((path) => this.parseWorkstream(path)));
    if (definitions.length === 0)
      throw new RegistryValidation('No workstream sources were discovered');
    const expected = Array.from({ length: 13 }, (_, index) => String(index + 1).padStart(2, '0'));
    if (expected.some((id) => !definitions.some((item) => item.workstreamId === id)))
      throw new RegistryValidation(`Missing workstream source; expected ${expected.join(', ')}`);
    return new WorkstreamRegistry(definitions);
  }

  private async parseAgent(sourcePath: string): Promise<AgentDefinition> {
    const source = await this.required(sourcePath);
    const frontmatter = metadata(source);
    const name = frontmatter.name ?? source.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (!name) throw new RegistryValidation(`Agent name cannot be resolved in ${sourcePath}`);
    const revision = hash(source);
    return {
      agentId: frontmatter.agent_id ?? sourceId(sourcePath),
      name,
      specialty: frontmatter.description ?? '[NEEDS INPUT: specialty]',
      category: sourcePath.split('/')[0] ?? '[NEEDS INPUT: category]',
      sourcePath,
      sourceRevision: revision,
      inputContractSummary: section(source, 'Core Mission') || '[NEEDS INPUT: input contract]',
      outputContractSummary: section(source, 'Deliverables') || '[NEEDS INPUT: output contract]',
      approvalRequirements: items(source, 'Critical Rules').filter((item) =>
        /approval|review|legal|consent/i.test(item),
      ),
      active: true,
      version: revision.slice(0, 16),
    };
  }

  private async parseWorkstream(sourcePath: string): Promise<WorkstreamDefinition> {
    const source = await this.required(sourcePath);
    const workstreamId = sourcePath.match(/strategy\/workstreams\/(\d{2})-/)?.[1];
    if (!workstreamId)
      throw new RegistryValidation(`Workstream ID cannot be resolved in ${sourcePath}`);
    const revision = hash(source);
    return {
      workstreamId,
      name: source.match(/^# Workstream \d{2}: (.+)$/m)?.[1]?.trim() ?? '[NEEDS INPUT: name]',
      sourcePath,
      sourceRevision: revision,
      objective: section(source, 'Objective') || '[NEEDS INPUT: objective]',
      upstreamDependencies: items(source, 'Upstream Inputs'),
      downstreamConsumers: items(source, 'Downstream Handoffs'),
      outputs: items(source, 'Artifact Outputs'),
      acceptanceCriteria: items(source, 'Acceptance Criteria'),
      blockingDependencies: [],
      optionalDependencies: [],
      approvalGates: items(source, 'Acceptance Criteria').filter((item) =>
        /approv|review|gate|consent|legal/i.test(item),
      ),
      unresolvedInputs: [...source.matchAll(/\[NEEDS INPUT[^\]]*\]/g)].map((match) => match[0]),
      version: revision.slice(0, 16),
    };
  }

  private async required(sourcePath: string): Promise<string> {
    try {
      return await readFile(join(this.repositoryRoot, sourcePath), 'utf8');
    } catch {
      throw new RegistryValidation(`Declared source is missing: ${sourcePath}`);
    }
  }
}

export interface RegistrySnapshot {
  version: string;
  agents: AgentDefinition[];
  workstreams: WorkstreamDefinition[];
  graphSource: string;
}
export function createRegistrySnapshot(
  agents: AgentDefinition[] = [],
  workstreams: WorkstreamDefinition[] = [],
): RegistrySnapshot {
  return {
    version: 'repository',
    agents,
    workstreams,
    graphSource: 'strategy/orchestration/dependency-graph.md',
  };
}

export function classifyEdge(line: string): DependencyKind {
  if (line.includes('-.')) return 'informational';
  if (line.includes('[[')) return 'unresolved';
  return 'blocking';
}

export function parseGraphEdges(source: string, version: string): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  for (const line of source.split('\n')) {
    const match = line.match(/^\s*(?:[A-Z]+|\d{2})[^-]*?(-->|-\.->)\s*(?:[A-Z]+|\d{2})/);
    if (!match) continue;
    const ids = [...line.matchAll(/\b(\d{2})\b/g)]
      .map((item) => item[1])
      .filter((id): id is string => Boolean(id));
    if (ids.length < 2) continue;
    const from = ids[0];
    const to = ids[1];
    if (!from || !to) continue;
    const kind = classifyEdge(line);
    edges.push({
      id: `${from}->${to}:${kind}`,
      graphVersion: version,
      fromWorkstreamId: from,
      toWorkstreamId: to,
      kind,
      source: line.trim(),
    });
  }
  return edges;
}

export * from './graph.js';
