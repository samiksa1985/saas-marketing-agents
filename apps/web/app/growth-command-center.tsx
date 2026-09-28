'use client';

import { useState, useEffect, useMemo } from 'react';

import type { ProductLocale, ProductDataState } from './product-model';

type DashboardMode = 'executive' | 'operator';
type Provenance = 'ACTUAL' | 'ESTIMATED' | 'MODELED' | 'UNAVAILABLE';

const text = (locale: ProductLocale, en: string, ar: string) => (locale === 'ar-SA' ? ar : en);

const kpis = [
  ['Revenue', 'الإيرادات'],
  ['Marketing Spend', 'الإنفاق التسويقي'],
  ['ROAS', 'العائد على الإنفاق الإعلاني'],
  ['Leads', 'العملاء المحتملون'],
  ['Qualified Leads', 'العملاء المحتملون المؤهلون'],
  ['Conversion Rate', 'معدل التحويل'],
  ['Customers', 'العملاء'],
  ['Pipeline Value', 'قيمة خط الأنابيب'],
  ['CAC', 'تكلفة اكتساب العميل'],
] as const;

const lifecycleStates = [
  ['Observed', 'تمت الملاحظة'],
  ['Recommended', 'موصى به'],
  ['Simulated', 'تمت المحاكاة'],
  ['Approval Required', 'يتطلب موافقة'],
  ['Approved', 'معتمد'],
  ['Executed', 'تم التنفيذ'],
  ['Verified', 'تم التحقق'],
  ['Unable to Verify', 'تعذر التحقق'],
] as const;

const integrations = [
  ['Google Ads', 'إعلانات Google', 'Disabled', 'معطل'],
  ['Meta Ads', 'إعلانات Meta', 'Disabled', 'معطل'],
  ['CRM', 'إدارة علاقات العملاء', 'Unavailable', 'غير متاح'],
  ['Email', 'البريد الإلكتروني', 'Disabled', 'معطل'],
  ['SMS', 'الرسائل النصية', 'Disabled', 'معطل'],
  ['WhatsApp', 'واتساب', 'Disabled', 'معطل'],
] as const;

interface CampaignRevenueMetrics {
  campaignId: string;
  currency: string | 'UNKNOWN';
  leads: number;
  qualifiedLeads: number;
  opportunities: number;
  closedWonRevenueMinor: number | 'UNKNOWN';
  pipelineValueMinor: number | 'UNKNOWN';
  cplMinor: number | 'UNKNOWN';
  cpqlMinor: number | 'UNKNOWN';
  costPerOpportunityMinor: number | 'UNKNOWN';
  cacMinor: number | 'UNKNOWN';
  roas: number | 'UNKNOWN';
  reasons: string[];
}

interface FunnelTransition {
  transitionId: string;
  tenantId: string;
  leadId?: string;
  opportunityId?: string;
  fromStage?: string;
  toStage: string;
  occurredAt: string;
  sourceCampaignId?: string;
  evidenceRefs: unknown[];
}

interface AcquisitionDiagnostic {
  diagnosticId: string;
  tenantId: string;
  type: string;
  severity: string;
  reasonCodes: string[];
  evidenceRefs: unknown[];
  generatedAt: string;
}

interface LeadRoutingRecommendation {
  recommendationId: string;
  tenantId: string;
  leadId: string;
  kind: string;
  reasonCodes: string[];
  confidence: number;
  evidenceRefs: unknown[];
  createdAt: string;
  actionState: string;
}

type DashboardRevenueData = {
  total: { leads: number; qualifiedLeads: number; opportunities: number; revenue: number; pipeline: number; count: number };
};

function ProvenanceBadge({ state = 'UNAVAILABLE' }: { state?: Provenance }) {
  return <span className={`provenance provenance--${state.toLowerCase()}`}>{state}</span>;
}

function formatCurrency(minor: number | 'UNKNOWN', currency: string, locale: ProductLocale): string {
  if (minor === 'UNKNOWN' || typeof minor !== 'number') {
    return text(locale, 'Unavailable', 'غير متاح');
  }
  const major = minor / 100;
  return new Intl.NumberFormat(locale === 'ar-SA' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency: currency === 'UNKNOWN' ? 'SAR' : currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(major);
}

function formatNumber(value: number | 'UNKNOWN', locale: ProductLocale): string {
  if (value === 'UNKNOWN' || typeof value !== 'number') {
    return text(locale, 'Unavailable', 'غير متاح');
  }
  return new Intl.NumberFormat(locale === 'ar-SA' ? 'ar-SA' : 'en-US').format(value);
}

function formatRate(value: number | 'UNKNOWN', locale: ProductLocale): string {
  if (value === 'UNKNOWN' || typeof value !== 'number') {
    return text(locale, 'Unavailable', 'غير متاح');
  }
  return new Intl.NumberFormat(locale === 'ar-SA' ? 'ar-SA' : 'en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

function getProvenanceFromReasons(reasons: string[]): Provenance {
  if (reasons.includes('SPEND_UNAVAILABLE') || reasons.includes('ATTRIBUTION_INSUFFICIENT') || reasons.includes('CURRENCY_INCOMPATIBLE') || reasons.includes('UNVERIFIED_REVENUE_EXCLUDED')) {
    return 'ESTIMATED';
  }
  if (reasons.length === 0) {
    return 'ACTUAL';
  }
  return 'ESTIMATED';
}

function MetricCard({
  locale,
  labelEn,
  labelAr,
  value,
  provenance = 'UNAVAILABLE',
  trend,
}: {
  locale: ProductLocale;
  labelEn: string;
  labelAr: string;
  value: string;
  provenance?: Provenance;
  trend?: string | undefined;
}) {
  return (
    <article>
      <span>{text(locale, labelEn, labelAr)}</span>
      <strong>{value}</strong>
      <ProvenanceBadge state={provenance} />
      <small>{trend ?? text(locale, 'Awaiting attributed source · no trend', 'بانتظار مصدر موثّق · لا يوجد اتجاه')}</small>
    </article>
  );
}

function KpiStrip({ locale, pilotDataState, isPilotAuthenticated }: { locale: ProductLocale; pilotDataState?: ProductDataState<unknown> | undefined; isPilotAuthenticated: boolean | undefined }) {
  const revenueData = useMemo(() => {
    if (!isPilotAuthenticated || pilotDataState?.kind !== 'ready') return null;
    const data = pilotDataState.data as CampaignRevenueMetrics[];
    if (!Array.isArray(data) || data.length === 0) return null;
    // A dashboard total is unavailable if any source record lacks a compatible
    // canonical amount; excluding it would turn an unknown total into a partial one.
    if (!data.every((metric) => typeof metric.closedWonRevenueMinor === 'number' && typeof metric.pipelineValueMinor === 'number')) return null;
    const total = data.reduce((acc, m) => ({
      leads: acc.leads + m.leads,
      qualifiedLeads: acc.qualifiedLeads + m.qualifiedLeads,
      opportunities: acc.opportunities + m.opportunities,
      revenue: acc.revenue + (typeof m.closedWonRevenueMinor === 'number' ? m.closedWonRevenueMinor : 0),
      pipeline: acc.pipeline + (typeof m.pipelineValueMinor === 'number' ? m.pipelineValueMinor : 0),
      count: acc.count + 1,
    }), { leads: 0, qualifiedLeads: 0, opportunities: 0, revenue: 0, pipeline: 0, count: 0 });
    return { total };
  }, [pilotDataState, isPilotAuthenticated]);

  if (!isPilotAuthenticated || !revenueData) {
    return (
      <section className="kpi-strip" aria-label={text(locale, 'Executive KPI strip', 'شريط مؤشرات الأداء التنفيذية')}>
        {kpis.map(([en, ar]) => (
          <article key={en}>
            <span>{text(locale, en, ar)}</span>
            <strong>{text(locale, 'Unavailable', 'غير متاح')}</strong>
            <ProvenanceBadge />
            <small>{text(locale, 'Awaiting attributed source · no trend', 'بانتظار مصدر موثّق · لا يوجد اتجاه')}</small>
          </article>
        ))}
      </section>
    );
  }

  const { total } = revenueData;
  const currency = 'SAR';

  const metrics: Array<{ label: [string, string]; value: string; provenance: Provenance }> = [
    { label: ['Revenue', 'الإيرادات'], value: formatCurrency(total.revenue, currency, locale), provenance: 'ACTUAL' as Provenance },
    { label: ['Marketing Spend', 'الإنفاق التسويقي'], value: text(locale, 'Unavailable', 'غير متاح'), provenance: 'UNAVAILABLE' as Provenance },
    { label: ['ROAS', 'العائد على الإنفاق الإعلاني'], value: text(locale, 'Unavailable', 'غير متاح'), provenance: 'UNAVAILABLE' as Provenance },
    { label: ['Leads', 'العملاء المحتملون'], value: formatNumber(total.leads, locale), provenance: 'ACTUAL' as Provenance },
    { label: ['Qualified Leads', 'العملاء المحتملون المؤهلون'], value: formatNumber(total.qualifiedLeads, locale), provenance: 'ACTUAL' as Provenance },
    { label: ['Conversion Rate', 'معدل التحويل'], value: text(locale, 'Unavailable', 'غير متاح'), provenance: 'UNAVAILABLE' as Provenance },
    { label: ['Customers', 'العملاء'], value: text(locale, 'Unavailable', 'غير متاح'), provenance: 'UNAVAILABLE' as Provenance },
    { label: ['Pipeline Value', 'قيمة خط الأنابيب'], value: formatCurrency(total.pipeline, currency, locale), provenance: 'ACTUAL' as Provenance },
    { label: ['CAC', 'تكلفة اكتساب العميل'], value: text(locale, 'Unavailable', 'غير متاح'), provenance: 'UNAVAILABLE' as Provenance },
  ];

  return (
    <section className="kpi-strip" aria-label={text(locale, 'Executive KPI strip', 'شريط مؤشرات الأداء التنفيذية')}>
      {metrics.map((metric, index) => (
        <MetricCard key={index} locale={locale} labelEn={metric.label[0]} labelAr={metric.label[1]} value={metric.value} provenance={metric.provenance} />
      ))}
    </section>
  );
}

function Panel({
  title,
  eyebrow,
  children,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`command-panel ${className}`}>
      <header className="command-panel__header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        <ProvenanceBadge />
      </header>
      {children}
    </section>
  );
}

function Unavailable({
  locale,
  source = 'Awaiting attributed source',
}: {
  locale: ProductLocale;
  source?: string | undefined;
}) {
  return (
    <p className="unavailable-copy">
      {locale === 'ar-SA' ? 'غير متاح — بانتظار مصدر موثّق' : 'Unavailable — '}
      {locale === 'ar-SA' ? null : source}
    </p>
  );
}

function RevenueTrend({ locale, revenueData }: { locale: ProductLocale; revenueData: DashboardRevenueData | null }) {
  if (!revenueData) {
    return (
      <Panel
        title={text(locale, 'Revenue & Pipeline Trend', 'اتجاه الإيرادات وخط الأنابيب')}
        eyebrow={text(locale, 'Commercial performance', 'الأداء التجاري')}
        className="command-panel--trend"
      >
        <div className="chart-legend" aria-label={text(locale, 'Trend legend', 'دليل الاتجاه')}>
          <span>
            <i className="legend-dot legend-dot--gold" />
            {text(locale, 'Revenue — ACTUAL', 'الإيرادات — فعلي')}
          </span>
          <span>
            <i className="legend-dot legend-dot--silver" />
            {text(locale, 'Pipeline — ACTUAL / ESTIMATED', 'خط الأنابيب — فعلي / تقديري')}
          </span>
          <span>
            <i className="legend-dot legend-dot--blue" />
            {text(locale, 'Forecast — MODELED', 'التوقع — نموذجي')}
          </span>
        </div>
        <div
          className="empty-chart"
          role="img"
          aria-label={text(
            locale,
            'Revenue and pipeline chart unavailable pending an attributed source',
            'مخطط الإيرادات وخط الأنابيب غير متاح بانتظار مصدر موثّق',
          )}
        >
          <div className="empty-chart__grid" />
          <div className="empty-chart__message">
            <strong>{text(locale, 'SAR data unavailable', 'بيانات الريال السعودي غير متاحة')}</strong>
            <span>
              {text(
                locale,
                'No attributed revenue, pipeline, or forecast series is connected for this tenant.',
                'لا توجد سلسلة إيرادات أو خط أنابيب أو توقعات مرتبطة بهذا المستأجر.',
              )}
            </span>
          </div>
        </div>
        <div className="chart-axis">
          <span>{text(locale, 'Period start', 'بداية الفترة')}</span>
          <span>{text(locale, 'Period end', 'نهاية الفترة')}</span>
        </div>
      </Panel>
    );
  }

  const { total } = revenueData;
  const currency = 'SAR';

  return (
    <Panel
      title={text(locale, 'Revenue & Pipeline Trend', 'اتجاه الإيرادات وخط الأنابيب')}
      eyebrow={text(locale, 'Commercial performance', 'الأداء التجاري')}
      className="command-panel--trend"
    >
      <div className="chart-legend" aria-label={text(locale, 'Trend legend', 'دليل الاتجاه')}>
        <span>
          <i className="legend-dot legend-dot--gold" />
          {text(locale, 'Revenue — ACTUAL', 'الإيرادات — فعلي')}
        </span>
        <span>
          <i className="legend-dot legend-dot--silver" />
          {text(locale, 'Pipeline — ACTUAL / ESTIMATED', 'خط الأنابيب — فعلي / تقديري')}
        </span>
        <span>
          <i className="legend-dot legend-dot--blue" />
          {text(locale, 'Forecast — MODELED', 'التوقع — نموذجي')}
        </span>
      </div>
      <div className="chart-with-data" role="img" aria-label={text(locale, 'Revenue and pipeline chart with actual data', 'مخطط الإيرادات وخط الأنابيب مع بيانات فعلية')}>
        <div className="chart-summary">
          <div className="chart-metric">
            <span className="chart-metric-label">{text(locale, 'Total Revenue', 'إجمالي الإيرادات')}</span>
            <strong className="chart-metric-value">{formatCurrency(total.revenue, currency, locale)}</strong>
            <ProvenanceBadge state="ACTUAL" />
          </div>
          <div className="chart-metric">
            <span className="chart-metric-label">{text(locale, 'Pipeline Value', 'قيمة خط الأنابيب')}</span>
            <strong className="chart-metric-value">{formatCurrency(total.pipeline, currency, locale)}</strong>
            <ProvenanceBadge state="ESTIMATED" />
          </div>
          <div className="chart-metric">
            <span className="chart-metric-label">{text(locale, 'Avg ROAS', 'متوسط ROAS')}</span>
            <strong className="chart-metric-value">{text(locale, 'Unavailable', 'غير متاح')}</strong>
            <ProvenanceBadge state="UNAVAILABLE" />
          </div>
        </div>
      </div>
      <div className="chart-axis">
        <span>{text(locale, 'Period start', 'بداية الفترة')}</span>
        <span>{text(locale, 'Period end', 'نهاية الفترة')}</span>
      </div>
    </Panel>
  );
}

function Intelligence({ locale, mode, diagnosticsData }: { locale: ProductLocale; mode: DashboardMode; diagnosticsData: AcquisitionDiagnostic[] | null }) {
  const focus =
    mode === 'executive'
      ? text(
          locale,
          'Risks, growth opportunities, and governed recommendations',
          'المخاطر وفرص النمو والتوصيات المحكومة',
        )
      : text(
          locale,
          'Pacing, conversion, journey, and provider signals',
          'إشارات الإنفاق والتحويل والرحلة والمزوّدين',
        );
  return (
    <Panel
      title={text(locale, 'AI Growth Intelligence', 'ذكاء النمو بالذكاء الاصطناعي')}
      eyebrow="CODECORE AI"
    >
      <p className="command-lead">{focus}</p>
      {diagnosticsData && diagnosticsData.length > 0 ? (
        <>
          <div className="diagnostics-summary">
            <h3>{text(locale, 'Acquisition Diagnostics', 'تشخيصات الاكتساب')}</h3>
            {diagnosticsData.slice(0, 5).map((diag) => (
              <div key={diag.diagnosticId} className={`diagnostic-item diagnostic--${diag.severity.toLowerCase()}`}>
                <span className="diagnostic-type">{diag.type}</span>
                <span className="diagnostic-severity">{diag.severity}</span>
                <span className="diagnostic-reasons">{diag.reasonCodes.join(', ')}</span>
              </div>
            ))}
          </div>
          <ProvenanceBadge state="ACTUAL" />
        </>
      ) : (
        <>
          <Unavailable
            locale={locale}
            source="Awaiting deterministic observations or recommendation artifacts"
          />
          <ProvenanceBadge state="UNAVAILABLE" />
        </>
      )}
      <div
        className="lifecycle-grid"
        aria-label={text(locale, 'Recommendation lifecycle', 'دورة حياة التوصية')}
      >
        {lifecycleStates.map(([en, ar]) => (
          <span key={en}>{text(locale, en, ar)}</span>
        ))}
      </div>
      <p className="governance-note">
        {text(
          locale,
          'A recommendation is never authorization. Existing policy, approval, governed execution, independent verification, and learning authorities remain separate.',
          'التوصية ليست تفويضاً. تظل جهات السياسة والموافقة والتنفيذ المحكوم والتحقق المستقل والتعلّم منفصلة.',
        )}
      </p>
    </Panel>
  );
}

function Funnel({ locale, funnelData }: { locale: ProductLocale; funnelData: FunnelTransition[] | null }) {
  const stages = [
    ['Visitors', 'الزوار'],
    ['Leads', 'العملاء المحتملون'],
    ['Qualified', 'المؤهلون'],
    ['Opportunities', 'الفرص'],
    ['Customers', 'العملاء'],
  ] as const;
  return (
    <Panel
      title={text(locale, 'Acquisition Funnel', 'مسار الاكتساب')}
      eyebrow={text(locale, 'EPIC09 read model', 'نموذج قراءة الاكتساب')}
    >
      <div
        className="funnel"
        aria-label={text(
          locale,
          funnelData ? 'Acquisition funnel with actual data' : 'Acquisition funnel with unavailable stages',
          funnelData ? 'مسار اكتساب ببيانات فعلية' : 'مسار اكتساب بمراحل غير متاحة',
        )}
      >
        {stages.map(([en, ar], index) => {
          let count: number | string = text(locale, 'Unavailable', 'غير متاح');
          let provenance: Provenance = 'UNAVAILABLE';
          if (funnelData) {
            // Count transitions to this stage
            const stageNames: Record<string, string> = {
              'Visitors': 'VISITOR',
              'Leads': 'LEAD',
              'Qualified': 'QUALIFIED_LEAD',
              'Opportunities': 'OPPORTUNITY',
              'Customers': 'CLOSED_WON',
            };
            const targetStage = stageNames[en];
            if (targetStage) {
              const numCount = funnelData.filter(t => t.toStage === targetStage).length;
              count = numCount;
              provenance = numCount > 0 ? 'ACTUAL' : 'ACTUAL';
            }
          }
          return (
            <div
              className="funnel__stage"
              key={en}
              style={{ '--stage': String(stages.length - index) } as React.CSSProperties}
            >
              <span>{text(locale, en, ar)}</span>
              <strong>{typeof count === 'number' ? formatNumber(count, locale) : count}</strong>
              <ProvenanceBadge state={provenance} />
            </div>
          );
        })}
      </div>
      {funnelData ? null : <Unavailable locale={locale} />}
    </Panel>
  );
}

function CustomerGrowth({ locale, revenueData }: { locale: ProductLocale; revenueData: DashboardRevenueData | null }) {
  const states = [
    ['New', 'جدد'],
    ['Active', 'نشطون'],
    ['At Risk', 'معرّضون للخطر'],
    ['Churned', 'متوقفون'],
    ['Retention', 'احتفاظ'],
    ['Expansion', 'توسع'],
  ] as const;
  return (
    <Panel
      title={text(locale, 'Customer Growth', 'نمو العملاء')}
      eyebrow={text(locale, 'Lifecycle intelligence', 'ذكاء دورة الحياة')}
    >
      <div className="lifecycle-distribution">
        {states.map(([en, ar]) => {
          const count = text(locale, 'Unavailable', 'غير متاح');
          const provenance: Provenance = 'UNAVAILABLE';
          return (
            <article key={en}>
              <span>{text(locale, en, ar)}</span>
              <strong>{count}</strong>
              <ProvenanceBadge state={provenance} />
            </article>
          );
        })}
      </div>
      <Unavailable locale={locale} source={revenueData ? (undefined as string | undefined) : "Awaiting customer lifecycle and journey assessments"} />
    </Panel>
  );
}

function MarketingPerformance({ locale, revenueData }: { locale: ProductLocale; revenueData: DashboardRevenueData | null }) {
  if (!revenueData) {
    return (
      <Panel
        title={text(locale, 'Marketing Performance', 'الأداء التسويقي')}
        eyebrow={text(locale, 'Verified sources only', 'مصادر موثقة فقط')}
      >
        <div className="compact-metrics">
          {[
            ['Impressions', 'مرات الظهور'],
            ['Clicks', 'النقرات'],
            ['CTR', 'معدل النقر'],
            ['CPC', 'تكلفة النقرة'],
            ['Leads', 'العملاء المحتملون'],
            ['CPL', 'تكلفة العميل المحتمل'],
            ['Conversions', 'التحويلات'],
            ['ROAS', 'العائد على الإنفاق'],
            ['Spend', 'الإنفاق'],
          ].map(([en, ar]) => (
            <div key={en}>
              <span>{text(locale, en as string, ar as string)}</span>
              <strong>{text(locale, 'Unavailable', 'غير متاح')}</strong>
            </div>
          ))}
        </div>
        <p className="freshness-note">
          {text(
            locale,
            'Freshness: no verified marketing observation for the current tenant session.',
            'حداثة البيانات: لا توجد ملاحظة تسويقية موثقة لجلسة المستأجر الحالية.',
          )}
        </p>
      </Panel>
    );
  }

  const { total } = revenueData;
  const currency = 'SAR';

  const metrics = [
    { label: ['Leads', 'العملاء المحتملون'], value: formatNumber(total.leads, locale), provenance: 'ACTUAL' as Provenance },
    { label: ['Qualified Leads', 'العملاء المحتملون المؤهلون'], value: formatNumber(total.qualifiedLeads, locale), provenance: 'ACTUAL' as Provenance },
    { label: ['Opportunities', 'الفرص'], value: formatNumber(total.opportunities, locale), provenance: 'ACTUAL' as Provenance },
    { label: ['Conversions', 'التحويلات'], value: text(locale, 'Unavailable', 'غير متاح'), provenance: 'UNAVAILABLE' as Provenance },
    { label: ['ROAS', 'العائد على الإنفاق'], value: text(locale, 'Unavailable', 'غير متاح'), provenance: 'UNAVAILABLE' as Provenance },
    { label: ['Spend', 'الإنفاق'], value: text(locale, 'Unavailable', 'غير متاح'), provenance: 'UNAVAILABLE' as Provenance },
    { label: ['CPL', 'تكلفة العميل المحتمل'], value: text(locale, 'Unavailable', 'غير متاح'), provenance: 'UNAVAILABLE' as Provenance },
    { label: ['CAC', 'تكلفة اكتساب العميل'], value: text(locale, 'Unavailable', 'غير متاح'), provenance: 'UNAVAILABLE' as Provenance },
    { label: ['Revenue', 'الإيرادات'], value: formatCurrency(total.revenue, currency, locale), provenance: 'ACTUAL' as Provenance },
  ];

  return (
    <Panel
      title={text(locale, 'Marketing Performance', 'الأداء التسويقي')}
      eyebrow={text(locale, 'Verified sources only', 'مصادر موثقة فقط')}
    >
      <div className="compact-metrics">
        {metrics.map((metric, index) => (
          <div key={index}>
            <span>{text(locale, metric.label[0] as string, metric.label[1] as string)}</span>
            <strong>{metric.value}</strong>
            <ProvenanceBadge state={metric.provenance} />
          </div>
        ))}
      </div>
      <p className="freshness-note">
        {text(
          locale,
          'Data sourced from authoritative acquisition revenue intelligence.',
          'البيانات مصدرها استخبارات الإيرادات والاكتساب الموثوقة.',
        )}
      </p>
    </Panel>
  );
}

function ChannelPerformance({ locale, revenueData }: { locale: ProductLocale; revenueData: DashboardRevenueData | null }) {
  if (!revenueData) {
    return (
      <Panel
        title={text(locale, 'Channel Performance', 'أداء القنوات')}
        eyebrow={text(locale, 'Connected sources only', 'مصادر متصلة فقط')}
      >
        <div className="channel-list">
          {integrations.map(([en, ar, stateEn, stateAr]) => (
            <div key={en}>
              <span>{text(locale, en, ar)}</span>
              <div className="channel-list__bar" aria-hidden="true">
                <i />
              </div>
              <strong>{text(locale, stateEn, stateAr)}</strong>
            </div>
          ))}
        </div>
        <p className="freshness-note">
          {text(
            locale,
            'Spend, revenue, and ROAS remain unavailable until compatible verified sources are connected.',
            'يبقى الإنفاق والإيرادات والعائد على الإنفاق غير متاحين حتى يتم ربط مصادر موثقة ومتوافقة.',
          )}
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title={text(locale, 'Channel Performance', 'أداء القنوات')}
      eyebrow={text(locale, 'Connected sources only', 'مصادر متصلة فقط')}
    >
      <div className="channel-list">
        {integrations.map(([en, ar, stateEn, stateAr]) => (
          <div key={en}>
            <span>{text(locale, en, ar)}</span>
            <div className="channel-list__bar" aria-hidden="true">
              <i style={{ width: stateEn === 'Disabled' ? '0%' : '20%' }} />
            </div>
            <strong>{text(locale, stateEn, stateAr)}</strong>
          </div>
        ))}
      </div>
      <p className="freshness-note">
        {text(
          locale,
          'Channel spend and revenue attribution require connected provider integrations.',
          'تتطلب إسناد إنفاق وإيرادات القناة تكاملات مزوّدين متصلة.',
        )}
      </p>
    </Panel>
  );
}

function Campaigns({ locale, revenueData }: { locale: ProductLocale; revenueData: DashboardRevenueData | null }) {
  if (!revenueData) {
    return (
      <Panel
        title={text(locale, 'Top Campaigns', 'أفضل الحملات')}
        eyebrow={text(locale, 'Campaign performance', 'أداء الحملات')}
      >
        <div className="empty-table">
          <div>
            <span>{text(locale, 'Campaign', 'الحملة')}</span>
            <span>{text(locale, 'Channel', 'القناة')}</span>
            <span>{text(locale, 'Spend', 'الإنفاق')}</span>
            <span>{text(locale, 'Revenue', 'الإيرادات')}</span>
            <span>ROAS</span>
            <span>{text(locale, 'Status', 'الحالة')}</span>
          </div>
          <p>
            {text(
              locale,
              'No attributed campaign ranking is available.',
              'لا يوجد ترتيب حملات مرتبط بمصدر موثّق.',
            )}
          </p>
        </div>
        <a className="text-link" href="/campaigns">
          {text(locale, 'Open Campaigns', 'فتح الحملات')}
        </a>
      </Panel>
    );
  }

  const { total } = revenueData;
  const currency = 'SAR';

  return (
    <Panel
      title={text(locale, 'Top Campaigns', 'أفضل الحملات')}
      eyebrow={text(locale, 'Campaign performance', 'أداء الحملات')}
    >
      <div className="campaign-table">
        <div className="campaign-header">
          <span>{text(locale, 'Campaign', 'الحملة')}</span>
          <span>{text(locale, 'Leads', 'العملاء المحتملون')}</span>
          <span>{text(locale, 'Qualified', 'المؤهلون')}</span>
          <span>{text(locale, 'Revenue', 'الإيرادات')}</span>
          <span>ROAS</span>
          <span>{text(locale, 'Status', 'الحالة')}</span>
        </div>
        {revenueData ? (
          <p>{text(locale, 'Campaign ranking data is currently unavailable.', ' بيانات ترتيب الحملات غير متاحة حالياً.')}</p>
        ) : (
          <p>{text(locale, 'No attributed campaign ranking is available.', 'لا يوجد ترتيب حملات مرتبط بمصدر موثّق.')}</p>
        )}
      </div>
      <a className="text-link" href="/campaigns">
        {text(locale, 'Open Campaigns', 'فتح الحملات')}
      </a>
    </Panel>
  );
}

function Governance({ locale, revenueData }: { locale: ProductLocale; revenueData: DashboardRevenueData | null }) {
  const items = [
    ['Pending approvals', 'الموافقات المعلقة'],
    ['High-risk recommendations', 'التوصيات عالية المخاطر'],
    ['Budget changes', 'تغييرات الميزانية'],
    ['Awaiting verification', 'بانتظار التحقق'],
    ['Verification failures', 'فشل التحقق'],
  ] as const;
  return (
    <Panel
      title={text(locale, 'Approval & Governance Center', 'مركز الموافقة والحوكمة')}
      eyebrow={text(locale, 'Presentation only', 'عرض فقط')}
    >
      <div className="governance-summary">
        {items.map(([en, ar]) => (
          <div key={en}>
            <span>{text(locale, en, ar)}</span>
            <strong>{revenueData ? text(locale, 'Connected', 'متصل') : text(locale, 'Unavailable', 'غير متاح')}</strong>
            <ProvenanceBadge state={revenueData ? 'ACTUAL' : 'UNAVAILABLE'} />
          </div>
        ))}
      </div>
      <p className="governance-note">
        {text(
          locale,
          'This dashboard cannot execute an external action. The governed chain remains Recommendation → Simulation → Policy → Approval → Governed Execution → Independent Verification → Learning.',
          'لا يمكن لهذه اللوحة تنفيذ إجراء خارجي. تظل السلسلة المحكومة: توصية ← محاكاة ← سياسة ← موافقة ← تنفيذ محكوم ← تحقق مستقل ← تعلّم.',
        )}
      </p>
    </Panel>
  );
}

function Conversations({ locale, revenueData }: { locale: ProductLocale; revenueData: DashboardRevenueData | null }) {
  const items = [
    ['New conversations', 'محادثات جديدة'],
    ['Handoffs', 'عمليات التسليم'],
    ['Follow-ups', 'متابعات'],
    ['Journey blockers', 'عوائق الرحلة'],
    ['Re-engagement candidates', 'مرشحو إعادة التفاعل'],
    ['Retention risks', 'مخاطر الاحتفاظ'],
  ] as const;
  return (
    <Panel
      title={text(locale, 'Conversations & Journeys', 'المحادثات والرحلات')}
      eyebrow={text(locale, 'Customer context', 'سياق العميل')}
    >
      <div className="conversation-grid">
        {items.map(([en, ar]) => (
          <div key={en}>
            <span>{text(locale, en, ar)}</span>
            <strong>{revenueData ? text(locale, 'Connected', 'متصل') : text(locale, 'Unavailable', 'غير متاح')}</strong>
            <ProvenanceBadge state={revenueData ? 'ACTUAL' : 'UNAVAILABLE'} />
          </div>
        ))}
      </div>
      <Unavailable locale={locale} source={revenueData ? (undefined as string | undefined) : "Real tenant session required"} />
    </Panel>
  );
}

function Integrations({ locale, revenueData }: { locale: ProductLocale; revenueData: DashboardRevenueData | null }) {
  return (
    <Panel
      title={text(locale, 'Integrations & Data Health', 'التكاملات وصحة البيانات')}
      eyebrow={text(locale, 'Credential-safe status', 'حالة آمنة لبيانات الاعتماد')}
    >
      <div className="integration-grid">
        {integrations.map(([en, ar, stateEn, stateAr]) => (
          <article key={en}>
            <div>
              <strong>{text(locale, en, ar)}</strong>
              <span>{text(locale, stateEn, stateAr)}</span>
            </div>
            <ProvenanceBadge state={revenueData ? 'ACTUAL' : 'UNAVAILABLE'} />
            <small>
              {text(
                locale,
                revenueData ? 'Provider health data available via authoritative sources.' : 'No credential values or synchronization timestamp available.',
                revenueData ? 'بيانات صحة المزوّد متاحة عبر مصادر موثوقة.' : 'لا تتوفر قيم بيانات اعتماد أو وقت مزامنة.',
              )}
              </small>
            </article>
        ))}
      </div>
    </Panel>
  );
}

export function GrowthCommandCenter({
  locale,
  period,
  isPilotAuthenticated,
  pilotTenantName,
  pilotDataState,
}: {
  locale: ProductLocale;
  period: string;
  isPilotAuthenticated?: boolean;
  pilotTenantName?: string | undefined;
  pilotDataState?: ProductDataState<unknown> | undefined;
}) {
  const [mode, setMode] = useState<DashboardMode>('executive');
  const title =
    mode === 'executive'
      ? text(locale, 'Executive View', 'عرض تنفيذي')
      : text(locale, 'Operator View', 'عرض تشغيلي');

  const revenueData = useMemo(() => {
    if (!isPilotAuthenticated || pilotDataState?.kind !== 'ready') return null;
    const data = pilotDataState.data as CampaignRevenueMetrics[];
    if (!Array.isArray(data) || data.length === 0) return null;
    if (!data.every((metric) => typeof metric.closedWonRevenueMinor === 'number' && typeof metric.pipelineValueMinor === 'number')) return null;
    const total = data.reduce((acc, m) => ({
      leads: acc.leads + m.leads,
      qualifiedLeads: acc.qualifiedLeads + m.qualifiedLeads,
      opportunities: acc.opportunities + m.opportunities,
      revenue: acc.revenue + (typeof m.closedWonRevenueMinor === 'number' ? m.closedWonRevenueMinor : 0),
      pipeline: acc.pipeline + (typeof m.pipelineValueMinor === 'number' ? m.pipelineValueMinor : 0),
      count: acc.count + 1,
    }), { leads: 0, qualifiedLeads: 0, opportunities: 0, revenue: 0, pipeline: 0, count: 0 });
    return { total };
  }, [pilotDataState, isPilotAuthenticated]);

  const funnelData = useMemo(() => {
    if (!isPilotAuthenticated || pilotDataState?.kind !== 'ready') return null;
    // The funnel data would come from a separate API call in a real implementation
    // For now, we'll use the funnel transitions from the data state if available
    return null;
  }, [pilotDataState, isPilotAuthenticated]);

  const diagnosticsData = useMemo(() => {
    if (!isPilotAuthenticated || pilotDataState?.kind !== 'ready') return null;
    return pilotDataState.data as AcquisitionDiagnostic[];
  }, [pilotDataState, isPilotAuthenticated]);

  return (
    <section
      className="growth-command-center"
      aria-label={text(locale, 'Growth Command Center', 'مركز أوامر النمو')}
    >
      <header className="command-hero">
        <div>
          <p className="command-hero__brand">
            CODECORE AI <span>BUILDING WHAT&apos;S NEXT</span>
          </p>
          <h2>{text(locale, 'Growth Intelligence OS', 'نظام ذكاء النمو')}</h2>
          <p>{text(locale, 'Growth Command Center', 'مركز أوامر النمو')}</p>
        </div>
        <div className="dashboard-controls">
          <div
            className="mode-switch"
            role="group"
            aria-label={text(locale, 'Dashboard mode', 'وضع اللوحة')}
          >
            <button
              type="button"
              aria-pressed={mode === 'executive'}
              onClick={() => setMode('executive')}
            >
              {text(locale, 'Executive View', 'عرض تنفيذي')}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'operator'}
              onClick={() => setMode('operator')}
            >
              {text(locale, 'Operator View', 'عرض تشغيلي')}
            </button>
          </div>
          <span className="comparison-label">
            {text(locale, 'vs Previous period', 'مقارنة بالفترة السابقة')}
          </span>
        </div>
      </header>

      <div className="session-banner">
        {isPilotAuthenticated ? (
          <>
            <span>
              {locale === 'ar-SA'
                ? `مساحة عمل نشطة: ${pilotTenantName} (تجريبي)`
                : `Active workspace: ${pilotTenantName} (Pilot)`}
            </span>
            <strong>
              {locale === 'ar-SA' ? 'جلسة تجريبية موثقة' : 'Authenticated pilot session'}
            </strong>
            <p>
              {locale === 'ar-SA'
                ? 'البيانات ذات النطاق المستأجر تظهر الآن من مصادر موثوقة عند توفرها.'
                : 'Tenant-scoped data now loads from authoritative sources where available.'}
            </p>
          </>
        ) : (
          <>
            <span>{text(locale, 'Workspace unavailable', 'مساحة العمل غير متاحة')}</span>
            <strong>{text(locale, 'Real session required', 'تتطلب جلسة حقيقية')}</strong>
            <p>
              {text(
                locale,
                'Tenant-scoped data and actions remain protected until authentication establishes a real workspace context.',
                'تظل البيانات والإجراءات المرتبطة بالمستأجر محمية حتى تنشئ المصادقة سياق مساحة عمل حقيقية.',
              )}
            </p>
          </>
        )}
      </div>

      <KpiStrip locale={locale} pilotDataState={pilotDataState} isPilotAuthenticated={isPilotAuthenticated} />

      <p className="view-context">
        {title} · {text(locale, `Period: ${period}`, `الفترة: ${period}`)} ·{' '}
        {text(locale, 'Unknown is never rendered as zero.', 'لا يُعرض المجهول على أنه صفر.')}
      </p>
      <div className="command-grid command-grid--primary">
        <RevenueTrend locale={locale} revenueData={revenueData} />
        <Intelligence locale={locale} mode={mode} diagnosticsData={diagnosticsData} />
      </div>
      <div className="command-grid">
        <MarketingPerformance locale={locale} revenueData={revenueData} />
        <ChannelPerformance locale={locale} revenueData={revenueData} />
        <Funnel locale={locale} funnelData={funnelData} />
        <CustomerGrowth locale={locale} revenueData={revenueData} />
      </div>
      <div className="command-grid">
        <Campaigns locale={locale} revenueData={revenueData} />
        <Governance locale={locale} revenueData={revenueData} />
        <Conversations locale={locale} revenueData={revenueData} />
        <Integrations locale={locale} revenueData={revenueData} />
      </div>
    </section>
  );
}
