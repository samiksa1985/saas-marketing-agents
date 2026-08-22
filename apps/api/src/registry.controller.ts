import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';

import type {
  TenantContext,
} from '@platform/contracts';

import {
  authorize,
} from '@platform/auth';

import {
  DependencyGraphLoader,
  DependencyReadinessResolver,
  RegistryLoader,
} from '@platform/registry';

import {
  ApiAuthGuard,
  getAuthContext,
  type AuthenticatedRequest,
} from './auth.guard.js';

export const REGISTRY_SERVICE =
  'PLATFORM_REGISTRY_SERVICE';

function apiRequest(
  request: unknown,
): AuthenticatedRequest {
  return request as AuthenticatedRequest;
}

@Injectable()
export class RegistryService {
  private readonly loader =
    new RegistryLoader(
      process.env.REPOSITORY_ROOT ??
        process.cwd(),
    );

  private readonly graphLoader =
    new DependencyGraphLoader(
      process.env.REPOSITORY_ROOT ??
        process.cwd(),
    );

  private readonly readiness =
    new DependencyReadinessResolver();

  async agents() {
    return (
      await this.loader
        .loadAgents()
    ).all();
  }

  async agent(
    agentId: string,
  ) {
    return (
      await this.loader
        .loadAgents()
    ).get(agentId);
  }

  async workstreams() {
    return (
      await this.loader
        .loadWorkstreams()
    ).all();
  }

  async workstream(
    workstreamId: string,
  ) {
    return (
      await this.loader
        .loadWorkstreams()
    ).get(workstreamId);
  }

  async graph(
    version: string,
  ) {
    return this.graphLoader.load(
      version,
    );
  }

  async graphReadiness(
    version: string,
    tenantContext:
      TenantContext,
  ) {
    const graph =
      await this.graphLoader.load(
        version,
      );

    const result =
      this.readiness.resolve({
        tenantContext,

        requiredApprovals:
          true,

        requiredInputs:
          graph.edges.every(
            (edge) =>
              edge.kind !==
              'unresolved',
          ),

        dependencies:
          graph.edges.map(
            (edge) => ({
              workstreamId:
                edge.toWorkstreamId,

              satisfied:
                edge.kind ===
                'informational',

              kind:
                edge.kind,

              ...(edge.kind ===
              'unresolved'
                ? {
                    reason:
                      'Unresolved [NEEDS INPUT] dependency',
                  }
                : {}),
            }),
          ),

        artifacts: [],
      });

    return {
      graph,

      readiness:
        result,
    };
  }
}

@Controller()
@UseGuards(
  ApiAuthGuard,
)
export class RegistryController {
  constructor(
    @Inject(
      REGISTRY_SERVICE,
    )
    private readonly registry:
      RegistryService,
  ) {}

  @Get('/agents')
  agents(
    @Req()
    request: unknown,
  ) {
    this.authorize(
      apiRequest(request),
    );

    return this.registry.agents();
  }

  @Get('/agents/:agentId')
  agent(
    @Param('agentId')
    agentId: string,

    @Req()
    request: unknown,
  ) {
    this.authorize(
      apiRequest(request),
    );

    return this.registry.agent(
      agentId,
    );
  }

  @Get('/workstreams')
  workstreams(
    @Req()
    request: unknown,
  ) {
    this.authorize(
      apiRequest(request),
    );

    return this.registry.workstreams();
  }

  @Get(
    '/workstreams/:workstreamId',
  )
  workstream(
    @Param(
      'workstreamId',
    )
    workstreamId: string,

    @Req()
    request: unknown,
  ) {
    this.authorize(
      apiRequest(request),
    );

    return this.registry.workstream(
      workstreamId,
    );
  }

  @Get(
    '/graphs/:version',
  )
  graph(
    @Param('version')
    version: string,

    @Req()
    request: unknown,
  ) {
    this.authorize(
      apiRequest(request),
    );

    return this.registry.graph(
      version,
    );
  }

  @Get(
    '/graphs/:version/readiness',
  )
  readiness(
    @Param('version')
    version: string,

    @Req()
    request: unknown,
  ) {
    const context =
      this.authorize(
        apiRequest(request),
      );

    return this.registry.graphReadiness(
      version,
      context,
    );
  }

  private authorize(
    request:
      AuthenticatedRequest,
  ): TenantContext {
    const context =
      getAuthContext(
        request,
      );

    try {
      return authorize(
        context,
        'workflow:read',
      );
    } catch (
      error
    ) {
      if (
        error instanceof
        Error
      ) {
        throw new ForbiddenException(
          error.message,
        );
      }

      throw new ForbiddenException(
        'Missing workflow:read permission',
      );
    }
  }
}