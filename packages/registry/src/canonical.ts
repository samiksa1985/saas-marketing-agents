import type { AgentDefinition, CanonicalAgentRecord, CanonicalAgentTier } from '@platform/contracts';
import { AgentRegistry, RegistryLoader } from './index.js';
import { AI_MARKETING_OS_DOMAIN_AGENTS } from '@platform/contracts';

export interface CanonicalAgentRegistrySnapshot {
  version: string;
  domainLeaders: CanonicalAgentRecord[];
  specialists: AgentDefinition[];
}

export interface CanonicalRegistryOptions {
  registryLoader?: RegistryLoader;
  sourceRevision?: string;
}

const SPECIALIST_CATEGORIES = new Set([
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
]);

function inferSpecialist(record: AgentDefinition): CanonicalAgentRecord {
  const category = SPECIALIST_CATEGORIES.has(record.category) ? record.category : 'specialist';
  return {
    id: record.agentId,
    name: record.name,
    tier: 'SPECIALIST',
    source: 'project1',
    mission: record.specialty,
    agentDefinition: record,
    consolidationStatus: 'KEEP_AS_SPECIALIST',
    reviewNote: `Existing specialist agent from Project 1 category: ${category}.`,
  };
}

export async function loadCanonicalAgentRegistry(
  options: CanonicalRegistryOptions = {},
): Promise<CanonicalAgentRegistrySnapshot> {
  const loader = options.registryLoader ?? new RegistryLoader();
  const specialists = (await loader.loadAgents()).all();

  const specialistIds = new Set(specialists.map((item) => item.agentId));
  const domainLeaders: CanonicalAgentRecord[] = AI_MARKETING_OS_DOMAIN_AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    tier: agent.id === 'ai-orchestrator' || agent.id === 'automation' ? 'CONTROL' : 'DOMAIN_LEADER',
    source: 'project2',
    mission: agent.mission,
    consolidationStatus: 'KEEP_AS_DOMAIN_LEADER',
    reviewNote:
      agent.id === 'ai-orchestrator'
        ? 'Technical coordination role. CATALYST remains the canonical business workflow graph/orchestrator.'
        : 'Domain leader imported from Project 2; specialists remain independently addressable.',
  } satisfies CanonicalAgentRecord));

  const duplicateNameCandidates = domainLeaders.filter((leader) =>
    specialists.some((specialist) => specialist.name.toLowerCase() === leader.name.toLowerCase()),
  );

  if (duplicateNameCandidates.length > 0) {
    // Name matches are evidence for human review, not automatic deletion.
    for (const candidate of duplicateNameCandidates) {
      candidate.consolidationStatus = 'MERGE_CANDIDATE';
      candidate.reviewNote = `${candidate.reviewNote} Exact name collision with an existing specialist registry entry; review before consolidating.`;
    }
  }

  return {
    version: options.sourceRevision ?? 'canonical-v1',
    domainLeaders,
    specialists,
  };
}

export function summarizeCanonicalRegistry(
  snapshot: CanonicalAgentRegistrySnapshot,
): {
  domainLeaders: number;
  specialists: number;
  mergeCandidates: number;
  totalAddressableAgents: number;
} {
  const mergeCandidates = snapshot.domainLeaders.filter(
    (item) => item.consolidationStatus === 'MERGE_CANDIDATE',
  ).length;

  return {
    domainLeaders: snapshot.domainLeaders.length,
    specialists: snapshot.specialists.length,
    mergeCandidates,
    totalAddressableAgents: snapshot.domainLeaders.length + snapshot.specialists.length,
  };
}

export { inferSpecialist };

