import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ArtifactReference,
  DependencyEdge,
  ReadinessResult,
  TenantContext,
  WorkflowGraphSnapshot,
} from '@platform/contracts';
import { classifyEdge, RegistryValidation } from './index.js';

export class DependencyGraphValidator {
  findCycles(edges: DependencyEdge[]): string[][] {
    const adjacency = new Map<string, string[]>();
    for (const edge of edges.filter((item) => item.kind === 'blocking')) {
      const targets = adjacency.get(edge.fromWorkstreamId) ?? [];
      targets.push(edge.toWorkstreamId);
      adjacency.set(edge.fromWorkstreamId, targets);
    }
    const cycles: string[][] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const walk = (node: string, path: string[]) => {
      if (visiting.has(node)) {
        const start = path.indexOf(node);
        cycles.push([...path.slice(start), node]);
        return;
      }
      if (visited.has(node)) return;
      visiting.add(node);
      for (const target of adjacency.get(node) ?? []) walk(target, [...path, node]);
      visiting.delete(node);
      visited.add(node);
    };
    for (const node of adjacency.keys()) walk(node, []);
    return cycles;
  }

  validate(snapshot: WorkflowGraphSnapshot): void {
    const cycles = this.findCycles(snapshot.edges);
    if (cycles.length > 0)
      throw new RegistryValidation(
        `Dependency graph contains cycles: ${cycles.map((cycle) => cycle.join(' -> ')).join('; ')}`,
      );
  }
}

export class DependencyGraphLoader {
  constructor(
    private readonly repositoryRoot = process.cwd(),
    private readonly validator = new DependencyGraphValidator(),
  ) {}

  async load(version = 'repository'): Promise<WorkflowGraphSnapshot> {
    const sourcePath = 'strategy/orchestration/dependency-graph.md';
    let source: string;
    try {
      source = await readFile(join(this.repositoryRoot, sourcePath), 'utf8');
    } catch {
      throw new RegistryValidation(`Declared source is missing: ${sourcePath}`);
    }
    const aliases = new Map<string, string>();
    for (const match of source.matchAll(/^\s*([A-Z]+)\[.*?\b(\d{2})\b[^\n]*\]/gm))
      aliases.set(match[1] ?? '', match[2] ?? '');
    const edges: DependencyEdge[] = [];
    for (const line of source.split('\n')) {
      const match = line.match(/^\s*([A-Z]+)\s+(-\..*?->|-->)\s*([A-Z]+)/);
      if (!match) continue;
      const from =
        aliases.get(match[1] ?? '') ?? (match[1] === 'NEEDS' ? 'NEEDS INPUT' : undefined);
      const to = aliases.get(match[3] ?? '');
      if (!from || !to)
        throw new RegistryValidation(
          `Graph edge references unknown workstream alias: ${line.trim()}`,
        );
      const kind =
        from === 'NEEDS INPUT'
          ? 'unresolved'
          : from === '11' && to === '10'
            ? 'informational'
            : classifyEdge(line);
      edges.push({
        id: `${from}->${to}:${kind}`,
        graphVersion: version,
        fromWorkstreamId: from,
        toWorkstreamId: to,
        kind,
        source: line.trim(),
      });
    }
    const snapshot: WorkflowGraphSnapshot = {
      version,
      sourcePath,
      sourceRevision: createHash('sha256').update(source).digest('hex'),
      workstreamIds: [...aliases.values()].sort(),
      edges,
      hasCycles: false,
    };
    this.validator.validate(snapshot);
    return { ...snapshot, hasCycles: false };
  }
}

export interface ReadinessInput {
  tenantContext?: TenantContext;
  requiredApprovals: boolean;
  requiredInputs: boolean;
  dependencies: Array<{
    workstreamId: string;
    satisfied: boolean;
    kind: DependencyEdge['kind'];
    reason?: string;
  }>;
  artifacts: ArtifactReference[];
}

export class DependencyReadinessResolver {
  resolve(input: ReadinessInput): ReadinessResult {
    const reasons: string[] = [];
    const satisfiedDependencies: string[] = [];
    const unresolvedDependencies: string[] = [];
    if (!input.tenantContext?.tenantId) reasons.push('Tenant context is required');
    if (!input.requiredApprovals) reasons.push('Required approvals are missing');
    if (!input.requiredInputs) reasons.push('Required inputs are missing');
    for (const dependency of input.dependencies) {
      if (dependency.kind === 'unresolved') {
        unresolvedDependencies.push(
          dependency.reason ?? `${dependency.workstreamId} is unresolved`,
        );
      } else if (dependency.kind === 'blocking' && !dependency.satisfied) {
        reasons.push(
          dependency.reason ?? `Blocking dependency is unsatisfied: ${dependency.workstreamId}`,
        );
      } else if (dependency.satisfied) {
        satisfiedDependencies.push(dependency.workstreamId);
      }
    }
    for (const artifact of input.artifacts) {
      if (artifact.accepted && artifact.tenantId === input.tenantContext?.tenantId) continue;
      reasons.push(`Artifact is not an accepted current-tenant input: ${artifact.artifactId}`);
    }
    return {
      state: reasons.length > 0 || unresolvedDependencies.length > 0 ? 'blocked' : 'ready',
      reasons,
      satisfiedDependencies,
      unresolvedDependencies,
    };
  }
}
