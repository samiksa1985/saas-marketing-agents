export type AcquisitionNodeType =
  | 'company'
  | 'account'
  | 'contact'
  | 'signal'
  | 'intent'
  | 'campaign'
  | 'interaction'
  | 'lead'
  | 'opportunity'
  | 'customer'
  | 'revenue';

export interface AcquisitionNode {
  id: string;
  tenantId: string;
  type: AcquisitionNodeType;
  label: string;
  attributes: Record<string, unknown>;
  evidenceIds: string[];
}

export type AcquisitionEdgeType =
  | 'belongs_to'
  | 'contacts'
  | 'triggered'
  | 'indicates'
  | 'targeted_by'
  | 'engaged_with'
  | 'converted_to'
  | 'advanced_to'
  | 'generated'
  | 'influenced';

export interface AcquisitionEdge {
  id: string;
  tenantId: string;
  fromId: string;
  toId: string;
  type: AcquisitionEdgeType;
  confidence?: number;
  evidenceIds: string[];
}

export interface AcquisitionGraphSnapshot {
  tenantId: string;
  nodes: AcquisitionNode[];
  edges: AcquisitionEdge[];
  generatedAt: string;
}

export class AcquisitionGraph {
  private readonly nodes = new Map<string, AcquisitionNode>();
  private readonly edges = new Map<string, AcquisitionEdge>();

  upsertNode(node: AcquisitionNode): void {
    this.nodes.set(node.id, { ...node, tenantId: node.tenantId });
  }

  addEdge(edge: AcquisitionEdge): void {
    if (!this.nodes.has(edge.fromId) || !this.nodes.has(edge.toId)) {
      throw new Error(`GRAPH_ENDPOINT_MISSING:${edge.fromId}:${edge.toId}`);
    }
    if (edge.tenantId !== this.nodes.get(edge.fromId)?.tenantId || edge.tenantId !== this.nodes.get(edge.toId)?.tenantId) {
      throw new Error('TENANT_SCOPE_DENIED:acquisition-graph');
    }
    this.edges.set(edge.id, { ...edge });
  }

  getNode(id: string): AcquisitionNode | undefined {
    return this.nodes.get(id);
  }

  neighbors(id: string, type?: AcquisitionNodeType): AcquisitionNode[] {
    const ids = new Set<string>();
    for (const edge of this.edges.values()) {
      if (edge.fromId === id) ids.add(edge.toId);
      if (edge.toId === id) ids.add(edge.fromId);
    }
    return [...ids]
      .map((nodeId) => this.nodes.get(nodeId))
      .filter((node): node is AcquisitionNode => Boolean(node))
      .filter((node) => type ? node.type === type : true);
  }

  path(fromId: string, toId: string, maxHops = 8): string[][] {
    if (fromId === toId) return [[fromId]];
    const queue: string[][] = [[fromId]];
    const visited = new Set([fromId]);

    while (queue.length) {
      const current = queue.shift()!;
      if (current.length > maxHops + 1) continue;
      const last = current[current.length - 1]!;
      for (const next of this.neighbors(last)) {
        if (visited.has(next.id)) continue;
        const nextPath = [...current, next.id];
        if (next.id === toId) return [nextPath];
        visited.add(next.id);
        queue.push(nextPath);
      }
    }
    return [];
  }

  snapshot(tenantId: string): AcquisitionGraphSnapshot {
    return {
      tenantId,
      nodes: [...this.nodes.values()].filter((node) => node.tenantId === tenantId),
      edges: [...this.edges.values()].filter((edge) => edge.tenantId === tenantId),
      generatedAt: new Date().toISOString(),
    };
  }
}

export function createAcquisitionGraph(tenantId: string): AcquisitionGraph {
  void tenantId;
  return new AcquisitionGraph();
}
