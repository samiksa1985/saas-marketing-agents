import { BadRequestException, Injectable, Controller, Get, Param, Headers } from '@nestjs/common';
import {
  DependencyGraphLoader,
  DependencyReadinessResolver,
  RegistryLoader,
} from '@platform/registry';

@Injectable()
export class RegistryService {
  private readonly loader = new RegistryLoader(process.env.REPOSITORY_ROOT ?? process.cwd());
  private readonly graphLoader = new DependencyGraphLoader(
    process.env.REPOSITORY_ROOT ?? process.cwd(),
  );
  private readonly readiness = new DependencyReadinessResolver();

  async agents() {
    return (await this.loader.loadAgents()).all();
  }
  async agent(agentId: string) {
    return (await this.loader.loadAgents()).get(agentId);
  }
  async workstreams() {
    return (await this.loader.loadWorkstreams()).all();
  }
  async workstream(workstreamId: string) {
    return (await this.loader.loadWorkstreams()).get(workstreamId);
  }
  async graph(version: string) {
    return this.graphLoader.load(version);
  }
  async graphReadiness(version: string, tenantId: string | undefined) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required');
    const graph = await this.graphLoader.load(version);
    const result = this.readiness.resolve({
      tenantContext: { tenantId, roles: [], permissions: [], locale: 'en' },
      requiredApprovals: true,
      requiredInputs: graph.edges.every((edge) => edge.kind !== 'unresolved'),
      dependencies: graph.edges.map((edge) => ({
        workstreamId: edge.toWorkstreamId,
        satisfied: edge.kind === 'informational',
        kind: edge.kind,
        ...(edge.kind === 'unresolved' ? { reason: 'Unresolved [NEEDS INPUT] dependency' } : {}),
      })),
      artifacts: [],
    });
    return { graph, readiness: result };
  }
}

@Controller()
export class RegistryController {
  constructor(private readonly registry: RegistryService) {}

  @Get('/agents') agents() {
    return this.registry.agents();
  }
  @Get('/agents/:agentId') agent(@Param('agentId') agentId: string) {
    return this.registry.agent(agentId);
  }
  @Get('/workstreams') workstreams() {
    return this.registry.workstreams();
  }
  @Get('/workstreams/:workstreamId') workstream(@Param('workstreamId') workstreamId: string) {
    return this.registry.workstream(workstreamId);
  }
  @Get('/graphs/:version') graph(@Param('version') version: string) {
    return this.registry.graph(version);
  }
  @Get('/graphs/:version/readiness') readiness(
    @Param('version') version: string,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    return this.registry.graphReadiness(version, tenantId);
  }
}
