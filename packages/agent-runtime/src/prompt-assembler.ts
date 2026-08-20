import type { Locale } from '@platform/contracts';
import type { ParsedAgentDefinition } from './definition-loader.js';

export interface PromptAssemblyContext {
  locale: Locale;

  tenantContext: {
    tenantId: string;
  };

  workflowId: string;
  taskId: string;
  workstreamId: string;
  agentId: string;

  approvedSystemInstructions: string;

  input: unknown;

  inputArtifactReferences: Array<{
    artifactId: string;
    kind: string;
  }>;
}

export interface AssembledPrompt {
  systemPrompt: string;
  userPrompt: string;
  locale: Locale;
  agentId: string;
  workflowId: string;
  taskId: string;
  workstreamId: string;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  const serialized = JSON.stringify(value, null, 2);

  return serialized ?? 'null';
}

function formatList(
  title: string,
  values: string[],
): string {
  if (values.length === 0) {
    return `${title}:\n- None`;
  }

  return [
    `${title}:`,
    ...values.map((value) => `- ${value}`),
  ].join('\n');
}

export function assembleAgentPrompt(
  definition: ParsedAgentDefinition,
  context: PromptAssemblyContext,
): AssembledPrompt {
  const systemSections = [
    `AGENT ID: ${definition.agentId}`,
    `AGENT NAME: ${definition.name}`,

    definition.description
      ? `DESCRIPTION:\n${definition.description}`
      : '',

    definition.identity
      ? `IDENTITY:\n${definition.identity}`
      : '',

    formatList(
      'MISSION',
      definition.mission,
    ),

    formatList(
      'CRITICAL RULES',
      definition.criticalRules,
    ),

    formatList(
      'DELIVERABLES',
      definition.deliverables,
    ),

    formatList(
      'SUCCESS METRICS',
      definition.successMetrics,
    ),

    formatList(
      'UNRESOLVED INPUTS',
      definition.needsInput,
    ),

    context.approvedSystemInstructions
      ? [
          'APPROVED SYSTEM INSTRUCTIONS:',
          context.approvedSystemInstructions,
        ].join('\n')
      : '',
  ].filter(Boolean);

  const systemPrompt = [
    'You are executing an approved agent definition inside a deterministic multi-tenant workflow runtime.',

    `LOCALE: ${context.locale}`,
    `TENANT ID: ${context.tenantContext.tenantId}`,
    `WORKFLOW ID: ${context.workflowId}`,
    `TASK ID: ${context.taskId}`,
    `WORKSTREAM ID: ${context.workstreamId}`,
    `EXECUTION AGENT ID: ${context.agentId}`,

    '',

    ...systemSections,

    '',

    'EXECUTION RULES:',
    '1. Follow the agent definition exactly.',
    '2. Do not invent unavailable business facts, customer data, pricing, proof, or other missing information.',
    '3. Preserve every unresolved requirement marked [NEEDS INPUT].',
    '4. Do not claim approval that has not been granted.',
    '5. Do not self-approve the resulting artifact.',
    '6. Return only work supported by the provided inputs and approved instructions.',
    '7. Preserve the requested locale and language direction.',
  ].join('\n');

  const artifactReferences =
    context.inputArtifactReferences.length === 0
      ? '- None'
      : context.inputArtifactReferences
          .map(
            (reference) =>
              `- ${reference.artifactId} (${reference.kind})`,
          )
          .join('\n');

  const userPrompt = [
    'TASK INPUT',
    '',
    formatValue(context.input),
    '',
    'INPUT ARTIFACT REFERENCES',
    artifactReferences,
    '',
    'OUTPUT EXPECTATION',
    'Produce the best possible agent proposal based only on the available inputs, agent definition, and approved instructions.',
    'Do not self-approve the result.',
    'Return explicit [NEEDS INPUT] markers wherever required information is unavailable.',
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
    locale: context.locale,
    agentId: context.agentId,
    workflowId: context.workflowId,
    taskId: context.taskId,
    workstreamId: context.workstreamId,
  };
}