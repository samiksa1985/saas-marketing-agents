import type { Locale, TenantContext } from '@platform/contracts';
import type { MarketingOSPlan } from '@platform/marketing-os-core';
import type { TransitionMetadata, Workflow, WorkflowRuntime } from '@platform/workflow-runtime';

export interface ExecutionPreparation { status:'blocked'|'prepared'|'started'; workflow?:Workflow; reasons:string[]; }

export class MarketingOSExecutionService {
  constructor(private readonly runtime: WorkflowRuntime) {}
  async prepare(plan:MarketingOSPlan,input:{engagementId:string;locale:Locale;idempotencyKey:string},context:TenantContext,start=false):Promise<ExecutionPreparation>{
    if(plan.readiness.blocked) return {status:'blocked',reasons:plan.readiness.reasons};
    if(!plan.plan.workstreams.length) return {status:'blocked',reasons:['No workstreams selected by Marketing Commander']};
    const workflow=await this.runtime.createWorkflow({
      tenantId:context.tenantId,engagementId:input.engagementId,locale:input.locale,
      selectedWorkstreamIds:plan.plan.workstreams.map(w=>w.id),idempotencyKey:input.idempotencyKey
    });
    if(!start) return {status:'prepared',workflow,reasons:['Workflow prepared but not started; external execution remains approval-gated.']};
    const metadata:TransitionMetadata={actor:context.userId??'marketing-os',reason:'Marketing OS execution request',timestamp:new Date().toISOString(),idempotencyKey:input.idempotencyKey};
    const started=await this.runtime.start(workflow.id,context,metadata);
    return {status:'started',workflow:started,reasons:[]};
  }
}
