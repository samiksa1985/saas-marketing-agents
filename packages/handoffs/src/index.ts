import type { Handoff } from '@platform/contracts';

export interface HandoffRepository {
  create(handoff: Handoff): Promise<Handoff>;
  accept(id: string): Promise<void>;
  reject(id: string, reason: string): Promise<void>;
  block(id: string, reason: string): Promise<void>;
}

export function createHandoff(input: Omit<Handoff, 'id' | 'status'>): Handoff {
  return { ...input, id: crypto.randomUUID(), status: 'pending' };
}
