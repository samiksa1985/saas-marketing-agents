export interface OutcomeEvent {
  id: string;
  tenantId: string;
  type: 'activity' | 'engagement' | 'lead' | 'qualified_lead' | 'meeting' | 'opportunity' | 'customer' | 'revenue' | 'profit';
  value: number;
  metric: string;
  occurredAt: string;
  sourceEntityId: string;
  attributes: Record<string, unknown>;
}

export interface FunnelSnapshot {
  activities: number;
  engagements: number;
  leads: number;
  qualifiedLeads: number;
  meetings: number;
  opportunities: number;
  customers: number;
  revenue: number;
  profit: number;
}

export interface GrowthInsight {
  title: string;
  diagnosis: string;
  recommendation: string;
  confidence: number;
  evidenceEventIds: string[];
}

export function buildFunnelSnapshot(events: OutcomeEvent[]): FunnelSnapshot {
  const sum = (type: OutcomeEvent['type']) =>
    events.filter((event) => event.type === type).reduce((total, event) => total + event.value, 0);

  return {
    activities: sum('activity'),
    engagements: sum('engagement'),
    leads: sum('lead'),
    qualifiedLeads: sum('qualified_lead'),
    meetings: sum('meeting'),
    opportunities: sum('opportunity'),
    customers: sum('customer'),
    revenue: sum('revenue'),
    profit: sum('profit'),
  };
}

export function generateGrowthInsights(events: OutcomeEvent[]): GrowthInsight[] {
  const funnel = buildFunnelSnapshot(events);
  const insights: GrowthInsight[] = [];

  if (funnel.leads > 0 && funnel.qualifiedLeads === 0) {
    insights.push({
      title:'Qualification bottleneck',
      diagnosis:'Leads are entering the funnel without recorded qualification outcomes.',
      recommendation:'Review ICP fit, lead scoring, qualification workflow and sales response SLA.',
      confidence:0.78,
      evidenceEventIds:events.filter((e) => e.type === 'lead').map((e) => e.id).slice(0,20),
    });
  }

  if (funnel.qualifiedLeads > 0 && funnel.opportunities === 0) {
    insights.push({
      title:'Pipeline conversion bottleneck',
      diagnosis:'Qualified leads are not producing recorded opportunities.',
      recommendation:'Review handoff acceptance, discovery quality, offer fit and follow-up timing.',
      confidence:0.82,
      evidenceEventIds:events.filter((e) => e.type === 'qualified_lead' || e.type === 'meeting').map((e) => e.id).slice(0,20),
    });
  }

  if (funnel.opportunities > 0 && funnel.customers === 0) {
    insights.push({
      title:'Late-stage conversion bottleneck',
      diagnosis:'Opportunities exist without recorded customer conversion.',
      recommendation:'Review proposal quality, objections, pricing, competition and close-plan discipline.',
      confidence:0.75,
      evidenceEventIds:events.filter((e) => e.type === 'opportunity').map((e) => e.id).slice(0,20),
    });
  }

  return insights;
}
