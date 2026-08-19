import type { Agent, Workstream } from '@platform/contracts';

export const workstreamRegistry: Workstream[] = Array.from({ length: 13 }, (_, index) => {
  const id = String(index + 1).padStart(2, '0');
  return {
    id,
    name: `Workstream ${id}`,
    sourcePath: `strategy/workstreams/${id}-`,
    version: 'repository',
  };
});

export interface RegistrySnapshot {
  version: string;
  agents: Agent[];
  workstreams: Workstream[];
  graphSource: string;
}

export function createRegistrySnapshot(agents: Agent[] = []): RegistrySnapshot {
  return {
    version: 'repository',
    agents,
    workstreams: workstreamRegistry,
    graphSource: 'strategy/orchestration/dependency-graph.md',
  };
}
