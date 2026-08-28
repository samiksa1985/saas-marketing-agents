import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorkflowRuntime } from '@platform/workflow-runtime';
import { MarketingOSExecutionService, type MarketingOSApprovalGateway, type MarketingOSApprovalRecord } from './execution.js';

function context(tenantId='tenant-a') {
  return { tenantId, roles: [], permissions: [], locale: 'en' as const };
}
function validPlan() {
  return {
    plan: {
      planId:'plan-approval-1', tenantId:'tenant-a',
      goal:'Generate qualified leads and pipeline in 90 days',
      objective:'generate_leads' as const, assumptions:[], needsInput:[],
      domainLeaders:[{id:'sales',reason:'Lead generation',priority:1,approval:'NONE' as const}],
      capabilities:[], workstreams:[
        {id:'01',reason:'Audience intelligence',priority:1,approval:'NONE' as const},
        {id:'08',reason:'Acquisition motion',priority:2,approval:'NONE' as const}
      ],
      specialistAgentIds:[], sequence:[],
      governance:{
        requiresHumanApproval:true,
        approvalReasons:['External execution requires approval.'],
        externalExecutionBlockedUntilApproval:true
      }
    },
    context:{
      tenantId:'tenant-a', generatedAt:new Date().toISOString(), memories:[],
      knowledge:[{id:'k1',tenantId:'tenant-a',documentId:'doc-1',text:'Approved B2B ICP',score:0.9,evidenceIds:['doc-1']}],
      artifacts:[],sources:[]
    },
    acquisition:{tenantId:'tenant-a',nodes:[],edges:[],generatedAt:new Date().toISOString()},
    readiness:{blocked:false,reasons:[]}
  };
}
test('canonical approval blocks execution until approved', async()=>{
  let decision: 'approved'|'approved_with_conditions'|'rejected'|'expired'|undefined;
  let approvalId='';
  const gateway: MarketingOSApprovalGateway = {
    create(_ctx,input) { approvalId=`approval-${input.artifactId}`; return {id:approvalId,tenantId:'tenant-a',artifactId:input.artifactId,...(decision?{decision}:{})}; },
    get(id,ctx) { if(ctx.tenantId!=='tenant-a'||id!==approvalId) throw new Error('Cross-tenant access denied'); return {id,tenantId:'tenant-a',artifactId:'x',...(decision?{decision}:{})}; }
  };
  const service=new MarketingOSExecutionService(new InMemoryWorkflowRuntime(),gateway);
  const prepared=await service.prepare({plan:validPlan(),engagementId:'engagement-approval',locale:'en',idempotencyKey:'approval-v1',context:context()});
  assert.equal(prepared.status,'APPROVAL_REQUIRED');
  assert.ok(prepared.approvalId);
  const blocked=await service.start(prepared.plan.plan.planId,context(),{actor:'test',reason:'blocked',timestamp:new Date().toISOString(),idempotencyKey:'start-before-approval'});
  assert.equal(blocked.status,'APPROVAL_REQUIRED');
  decision='approved';
  const started=await service.start(prepared.plan.plan.planId,context(),{actor:'test',reason:'approved',timestamp:new Date().toISOString(),idempotencyKey:'start-after-approval'});
  assert.equal(started.approved,true);
  assert.equal(started.status,'RUNNING');
  assert.equal(started.workflow?.status,'running');
});
test('approval access remains tenant isolated', async()=>{
  const gateway: MarketingOSApprovalGateway = {
    create(_ctx,input){ return {id:'approval-1',tenantId:'tenant-a',artifactId:input.artifactId}; },
    get(){ throw new Error('Cross-tenant access denied'); }
  };
  const service=new MarketingOSExecutionService(new InMemoryWorkflowRuntime(),gateway);
  const prepared=await service.prepare({plan:validPlan(),engagementId:'engagement-tenant',locale:'en',idempotencyKey:'approval-tenant-v1',context:context()});
  assert.throws(()=>service.get(prepared.plan.plan.planId,context('tenant-b')),/Cross-tenant access denied/);
});
