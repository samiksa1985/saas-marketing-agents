'use client';

import type { ProductDataState, ProductLocale, ProductView } from './product-model';

type SurfaceId = Extract<ProductView['id'], 'campaigns' | 'customers' | 'conversations' | 'journeys' | 'approvals' | 'analytics' | 'integrations' | 'reports' | 'admin'>;

const copy = (locale: ProductLocale, en: string, ar: string) => locale === 'ar-SA' ? ar : en;
const label = (value: string) => value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
const safeValue = (value: unknown): string => {
  if (value === null || value === undefined || value === 'UNKNOWN') return 'Unavailable';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'Available';
};

type SurfaceSpec = {
  title: [string, string];
  purpose: [string, string];
  source: string;
  columns: readonly string[];
  safeNote: [string, string];
};

const specs: Record<SurfaceId, SurfaceSpec> = {
  campaigns: {
    title: ['Campaign performance workspace', 'مساحة عمل أداء الحملات'],
    purpose: ['Read-only campaign revenue intelligence; planning and external execution remain governed backend actions.', 'استخبارات إيرادات الحملات للقراءة فقط؛ يبقى التخطيط والتنفيذ الخارجي إجراءات خلفية محكومة.'],
    source: 'GET /revenue-intelligence', columns: ['campaignId', 'leads', 'qualifiedLeads', 'closedWonRevenueMinor', 'roas'],
    safeNote: ['No campaign is invented when no canonical performance record exists.', 'لا يتم اختراع حملة عند عدم وجود سجل أداء موثوق.'],
  },
  customers: {
    title: ['Customer acquisition workspace', 'مساحة عمل اكتساب العملاء'],
    purpose: ['Leads are authoritative acquisition records. Customer count remains unavailable until a customer read model exists.', 'العملاء المحتملون سجلات اكتساب موثوقة. يظل عدد العملاء غير متاح حتى يوجد نموذج قراءة للعملاء.'],
    source: 'GET /leads', columns: ['id', 'status', 'identityId'],
    safeNote: ['Customers are not inferred from qualification percentages.', 'لا يتم استنتاج العملاء من نسب التأهيل.'],
  },
  conversations: {
    title: ['Conversation intelligence', 'استخبارات المحادثات'],
    purpose: ['Read-only conversation signals, handoffs, and follow-up context. No send control is present.', 'إشارات المحادثات وعمليات التسليم وسياق المتابعة للقراءة فقط. لا يوجد عنصر إرسال.'],
    source: 'GET /customer-engagement/conversations', columns: ['id', 'channel', 'state'],
    safeNote: ['Recommendations remain recommendations; communication delivery is disabled.', 'تبقى التوصيات توصيات؛ تسليم الاتصالات معطل.'],
  },
  journeys: {
    title: ['Lifecycle journey workspace', 'مساحة عمل رحلة دورة الحياة'],
    purpose: ['Journey analytics are shown only with canonical evidence. A recommendation is not authorization.', 'تظهر تحليلات الرحلة فقط مع أدلة موثوقة. التوصية ليست تفويضاً.'],
    source: 'GET /customer-journey/analytics', columns: ['stage', 'transition', 'nextAction', 'state'],
    safeNote: ['Lifecycle activation requires the existing governance and approval chain.', 'يتطلب تفعيل دورة الحياة سلسلة الحوكمة والموافقة الحالية.'],
  },
  approvals: {
    title: ['Approval review queue', 'قائمة مراجعة الموافقات'],
    purpose: ['Canonical approval records and evidence. This surface does not change approval state.', 'سجلات وأدلة الموافقة الموثوقة. لا يغير هذا السطح حالة الموافقة.'],
    source: 'GET /approvals', columns: ['id', 'artifactId', 'decision', 'conditions'],
    safeNote: ['Approval, execution, and verification remain distinct backend states.', 'الموافقة والتنفيذ والتحقق حالات خلفية منفصلة.'],
  },
  analytics: {
    title: ['Evidence-aware analytics', 'تحليلات واعية بالأدلة'],
    purpose: ['Revenue intelligence is rendered with its canonical fields and source limitations.', 'تُعرض استخبارات الإيرادات بحقولها الموثوقة وحدود المصدر.'],
    source: 'GET /revenue-intelligence', columns: ['campaignId', 'leads', 'qualifiedLeads', 'pipelineValueMinor', 'closedWonRevenueMinor'],
    safeNote: ['Unknown values are not rendered as zero or as an attributed trend.', 'لا تُعرض القيم المجهولة كصفر أو كاتجاه منسوب.'],
  },
  integrations: {
    title: ['Provider-neutral integration readiness', 'جاهزية تكامل محايدة للمزوّد'],
    purpose: ['Bindings show configuration and execution-mode metadata only; credentials and activation controls are excluded.', 'تعرض الارتباطات بيانات التكوين ووضع التنفيذ فقط؛ تُستبعد بيانات الاعتماد وعناصر التفعيل.'],
    source: 'GET /provider-integrations/bindings', columns: ['provider', 'environment', 'configured', 'enabled', 'executionMode'],
    safeNote: ['Provider execution remains disabled in this pilot.', 'يبقى تنفيذ المزوّد معطلاً في هذه التجربة.'],
  },
  reports: {
    title: ['In-app growth reports', 'تقارير النمو داخل التطبيق'],
    purpose: ['Authoritative revenue observations can be reviewed in-app. Export is unavailable until a backend export service exists.', 'يمكن مراجعة ملاحظات الإيرادات الموثوقة داخل التطبيق. التصدير غير متاح حتى توجد خدمة تصدير خلفية.'],
    source: 'GET /revenue-intelligence', columns: ['campaignId', 'currency', 'leads', 'qualifiedLeads', 'closedWonRevenueMinor'],
    safeNote: ['Export unavailable — no report generation is implied.', 'التصدير غير متاح — لا يُفترض إنشاء تقرير.'],
  },
  admin: {
    title: ['Safe workspace administration', 'إدارة آمنة لمساحة العمل'],
    purpose: ['Review governance evidence and approval history without secrets, RLS controls, role mutation, or provider activation.', 'راجع أدلة الحوكمة وسجل الموافقات دون أسرار أو ضوابط RLS أو تعديل أدوار أو تفعيل مزوّد.'],
    source: 'GET /approvals', columns: ['id', 'artifactId', 'decision', 'conditions'],
    safeNote: ['Administrative mutations are unavailable unless separately backed by canonical authority.', 'تعديلات الإدارة غير متاحة ما لم تكن مدعومة بشكل منفصل بجهة موثوقة.'],
  },
};

function StateNotice({ state, locale }: { state: Exclude<ProductDataState<unknown>, { kind: 'ready' }>; locale: ProductLocale }) {
  const messages: Record<typeof state.kind, [string, string]> = {
    loading: ['Loading authoritative data…', 'جارٍ تحميل البيانات الموثوقة…'],
    empty: [state.kind === 'empty' ? state.message.en : '', state.kind === 'empty' ? state.message.ar : ''],
    unavailable: [state.kind === 'unavailable' ? state.message.en : '', state.kind === 'unavailable' ? state.message.ar : ''],
    error: [state.kind === 'error' ? state.message.en : '', state.kind === 'error' ? state.message.ar : ''],
    'permission-denied': ['Permission denied by the canonical backend authority.', 'تم رفض الإذن من جهة الخلفية الموثوقة.'],
    'entitlement-unavailable': ['This capability is unavailable for the current entitlement.', 'هذه القدرة غير متاحة للاستحقاق الحالي.'],
  };
  return <p className={`surface-state surface-state--${state.kind}`}>{copy(locale, ...messages[state.kind])}</p>;
}

function DataTable({ rows, columns, locale }: { rows: unknown[]; columns: readonly string[]; locale: ProductLocale }) {
  return <div className="surface-table" role="region" aria-label={copy(locale, 'Canonical records', 'السجلات الموثوقة')}>
    <table>
      <thead><tr>{columns.map((column) => <th key={column}>{label(column)}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => {
        const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
        return <tr key={typeof record.id === 'string' ? record.id : index}>{columns.map((column) => <td key={column}>{safeValue(record[column])}</td>)}</tr>;
      })}</tbody>
    </table>
  </div>;
}

export function CommercialSurface({ view, locale, dataState }: { view: ProductView; locale: ProductLocale; dataState: ProductDataState<unknown> }) {
  const spec = specs[view.id as SurfaceId];
  if (!spec) return null;
  const rows = dataState.kind === 'ready' && Array.isArray(dataState.data) ? dataState.data : [];
  const journeyUnknown = view.id === 'journeys' && dataState.kind === 'ready' && !Array.isArray(dataState.data) && (dataState.data as { state?: unknown }).state === 'UNKNOWN';
  const renderedState: Exclude<ProductDataState<unknown>, { kind: 'ready' }> | null = journeyUnknown
    ? { kind: 'unavailable', compositionEndpoint: spec.source, message: { en: 'Journey analytics are unavailable until the tenant journey population is complete.', ar: 'تحليلات الرحلة غير متاحة حتى تكتمل مجموعة رحلات المستأجر.' } }
    : dataState.kind === 'ready' ? null : dataState;
  return <section className="commercial-surface" aria-label={copy(locale, ...spec.title)}>
    <header className="commercial-surface__header"><div><p className="eyebrow">{spec.source}</p><h2>{copy(locale, ...spec.title)}</h2><p>{copy(locale, ...spec.purpose)}</p></div><span className="provenance provenance--actual">CANONICAL READ</span></header>
    {renderedState ? <StateNotice state={renderedState} locale={locale} /> : <DataTable rows={rows} columns={spec.columns} locale={locale} />}
    <footer>{copy(locale, ...spec.safeNote)}</footer>
  </section>;
}
