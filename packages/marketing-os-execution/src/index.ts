/**
 * Compatibility entry point for consumers that previously imported the
 * provisional execution package. The implementation lives exclusively in
 * @platform/marketing-os-core so Marketing OS has one execution service.
 */
export {
  MarketingOSExecutionService,
  type ExecutionRecord,
  type MarketingOSApprovalGateway,
  type MarketingOSApprovalRecord,
  type MarketingOSExecutionStatus,
} from '@platform/marketing-os-core';
