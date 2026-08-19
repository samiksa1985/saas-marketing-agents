import type { AuditEvent, Id } from '@platform/contracts';

export interface AuditEventRepository {
  append(event: AuditEvent): Promise<void>;
  listByTenant(tenantId: Id): Promise<AuditEvent[]>;
}

export function createAuditEvent(input: Omit<AuditEvent, 'id' | 'occurredAt'>): AuditEvent {
  return { ...input, id: crypto.randomUUID(), occurredAt: new Date().toISOString() };
}
