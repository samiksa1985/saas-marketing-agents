import type { Artifact, Tenant } from '@platform/contracts';

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateTenant(tenant: Tenant): ValidationResult {
  const issues: string[] = [];
  if (!tenant.id) issues.push('tenant.id is required');
  if (!tenant.name.trim()) issues.push('tenant.name is required');
  return { valid: issues.length === 0, issues };
}

export function validateArtifact(artifact: Artifact): ValidationResult {
  const issues: string[] = [];
  if (!artifact.tenantId) issues.push('artifact.tenantId is required');
  if (!artifact.locale) issues.push('artifact.locale is required');
  if (!artifact.contentRef) issues.push('artifact.contentRef is required');
  return { valid: issues.length === 0, issues };
}
