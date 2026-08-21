import type {
  ArtifactReference,
  TenantContext,
} from '@platform/contracts';

import {
  AIGatewayAgentExecutor,
  type AgentExecutionContext,
  type AgentExecutionResult,
  type AgentExecutor,
  type ProposedAgentArtifact,
} from './index.js';

import {
  loadAgentDefinition,
  type ParsedAgentDefinition,
} from './definition-loader.js';

import {
  assembleAgentPrompt,
  type AssembledPrompt,
} from './prompt-assembler.js';

import {
  validateICPAccount,
  type ICPAccount,
  type ICPDefinition,
  type ICPValidationResult,
} from './icp-contract.js';

export interface AgentOrchestrationRequest {
  tenantContext: TenantContext;

  workflowId: string;
  taskId: string;
  workstreamId: string;

  agentId: string;
  agentSourcePath: string;

  locale: AgentExecutionContext['locale'];

  input: unknown;

  inputArtifactReferences: ArtifactReference[];

  approvedSystemInstructions: string;

  executionPolicy: AgentExecutionContext['executionPolicy'];

  idempotencyKey: string;

  icpAccount?: ICPAccount;

  icpDefinition?: ICPDefinition;
}

export interface AgentOrchestrationResult {
  definition: ParsedAgentDefinition;

  assembledPrompt: AssembledPrompt;

  icpValidation?: ICPValidationResult;

  execution: AgentExecutionResult;

  proposedArtifact: ProposedAgentArtifact;
}

export class AgentOrchestrationError extends Error {
  constructor(
    public readonly code:
      | 'agent_mismatch'
      | 'icp_invalid'
      | 'execution_failed',
    message: string,
  ) {
    super(message);
    this.name = 'AgentOrchestrationError';
  }
}

export interface AgentDefinitionLoader {
  load(
    sourcePath: string,
  ): Promise<ParsedAgentDefinition>;
}

export interface PromptAssembler {
  assemble(
    definition: ParsedAgentDefinition,
    context: {
      locale: AgentExecutionContext['locale'];
      tenantContext: TenantContext;
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
    },
  ): AssembledPrompt;
}

class RepositoryAgentDefinitionLoader
  implements AgentDefinitionLoader
{
  async load(
    sourcePath: string,
  ): Promise<ParsedAgentDefinition> {
    return loadAgentDefinition(
      sourcePath,
    );
  }
}

class DefaultPromptAssembler
  implements PromptAssembler
{
  assemble(
    definition: ParsedAgentDefinition,
    context: {
      locale: AgentExecutionContext['locale'];
      tenantContext: TenantContext;
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
    },
  ): AssembledPrompt {
    return assembleAgentPrompt(
      definition,
      context,
    );
  }
}

export interface AgentExecutionOrchestratorOptions {
  executor: AgentExecutor;

  definitionLoader?: AgentDefinitionLoader;

  promptAssembler?: PromptAssembler;
}

export class AgentExecutionOrchestrator {
  private readonly definitionLoader: AgentDefinitionLoader;

  private readonly promptAssembler: PromptAssembler;

  constructor(
    private readonly options: AgentExecutionOrchestratorOptions,
  ) {
    this.definitionLoader =
      options.definitionLoader ??
      new RepositoryAgentDefinitionLoader();

    this.promptAssembler =
      options.promptAssembler ??
      new DefaultPromptAssembler();
  }

  async execute(
    request: AgentOrchestrationRequest,
  ): Promise<AgentOrchestrationResult> {
    const definition =
      await this.definitionLoader.load(
        request.agentSourcePath,
      );

    if (
      definition.agentId !==
      request.agentId
    ) {
      throw new AgentOrchestrationError(
        'agent_mismatch',
        `Requested agent "${request.agentId}" does not match loaded definition "${definition.agentId}".`,
      );
    }

    let icpValidation:
      | ICPValidationResult
      | undefined;

    if (
      request.icpAccount &&
      request.icpDefinition
    ) {
      icpValidation =
        validateICPAccount(
          request.icpAccount,
          request.icpDefinition
            .evidenceRules,
        );

      if (!icpValidation.valid) {
        throw new AgentOrchestrationError(
          'icp_invalid',
          icpValidation.issues
            .map(
              (issue) =>
                `${issue.path}: ${issue.message}`,
            )
            .join('; '),
        );
      }
    }

    const assembledPrompt =
      this.promptAssembler.assemble(
        definition,
        {
          locale: request.locale,
          tenantContext:
            request.tenantContext,
          workflowId:
            request.workflowId,
          taskId:
            request.taskId,
          workstreamId:
            request.workstreamId,
          agentId:
            request.agentId,
          approvedSystemInstructions:
            request.approvedSystemInstructions,
          input: request.input,
          inputArtifactReferences:
            request.inputArtifactReferences.map(
              (reference) => ({
                artifactId:
                  reference.artifactId,
                kind:
                  reference.status,
              }),
            ),
        },
      );

    const executionRequest = {
      tenantContext:
        request.tenantContext,

      workflowId:
        request.workflowId,

      taskId:
        request.taskId,

      workstreamId:
        request.workstreamId,

      agentId:
        request.agentId,

      locale:
        request.locale,

      inputArtifactReferences:
        request.inputArtifactReferences,

      approvedSystemInstructions:
        assembledPrompt.systemPrompt,

      executionPolicy:
        request.executionPolicy,

      input: {
        originalInput:
          request.input,

        assembledUserPrompt:
          assembledPrompt.userPrompt,
      },

      idempotencyKey:
        request.idempotencyKey,
    };

    try {
      const execution =
        await this.options.executor.execute(
          executionRequest,
        );

      const result: AgentOrchestrationResult =
        {
          definition,
          assembledPrompt,
          execution,
          proposedArtifact:
            execution.proposedArtifact,
        };

      if (icpValidation) {
        result.icpValidation =
          icpValidation;
      }

      return result;
    } catch (error) {
      if (
        error instanceof
        AgentOrchestrationError
      ) {
        throw error;
      }

      throw new AgentOrchestrationError(
        'execution_failed',
        error instanceof Error
          ? error.message
          : 'Agent execution failed.',
      );
    }
  }
}

export function createDefaultAgentExecutionOrchestrator(
  executor: AgentExecutor,
): AgentExecutionOrchestrator {
  return new AgentExecutionOrchestrator({
    executor,
  });
}

export function createMockAgentExecutionOrchestrator(
  router: ConstructorParameters<
    typeof AIGatewayAgentExecutor
  >[0],
): AgentExecutionOrchestrator {
  return new AgentExecutionOrchestrator({
    executor:
      new AIGatewayAgentExecutor(
        router,
      ),
  });
}