'use client';

import { useMemo, useState } from 'react';

import {
  assessProductAccess,
  copy,
  directionFor,
  productNavigation,
  productViews,
  unavailableState,
  type ProductAccess,
  type ProductLocale,
  type ProductView,
} from './product-model';

type ProductShellProps = {
  initialView: ProductView['id'];
};

const signedOutAccess: ProductAccess = {
  tenantContext: 'missing',
  permissions: [],
  entitlements: [],
};

const ui = (locale: ProductLocale, en: string, ar: string) => (locale === 'ar-SA' ? ar : en);

function SourcePanel({ view, locale }: { view: ProductView; locale: ProductLocale }) {
  const unavailable = unavailableState(view);

  return (
    <aside className="source-panel" aria-label={ui(locale, 'Source status', 'حالة المصدر')}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{ui(locale, 'Authoritative data sources', 'مصادر البيانات الموثوقة')}</p>
          <h2>{ui(locale, 'Data readiness', 'جاهزية البيانات')}</h2>
        </div>
        <span className="status-pill status-pill--composition-required">{ui(locale, 'Session required', 'تتطلب جلسة')}</span>
      </div>
      <p>{copy(unavailable.message, locale)}</p>
      <ul className="source-list">{view.dataSources.map((source) => <li key={source.endpoint}><span>{copy(source.label, locale)}</span><code>{source.endpoint}</code></li>)}</ul>
    </aside>
  );
}

function ExecutiveBoard({ locale }: { locale: ProductLocale }) {
  const labels =
    locale === 'ar-SA'
      ? ['الاكتساب', 'مسار التحويل', 'الإيرادات', 'العملاء والنمو']
      : ['Acquisition', 'Conversion funnel', 'Revenue', 'Customers and growth'];

  return (
    <section
      className="operating-board"
      aria-label={locale === 'ar-SA' ? 'لوحة المدير التنفيذي' : 'Executive operating board'}
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{locale === 'ar-SA' ? 'لوحة التشغيل' : 'Operating board'}</p>
          <h2>
            {locale === 'ar-SA'
              ? 'مقاييس أعمال موثّقة المصدر'
              : 'Source-attributed business signals'}
          </h2>
        </div>
        <span className="status-pill status-pill--composition-required">
          {ui(locale, 'Unavailable', 'غير متاح')}
        </span>
      </div>
      <p>
        {locale === 'ar-SA'
          ? 'لا تُعرض أرقام مُختلقة. ستظهر كل إشارة فقط بعد ربط مصدر ACTUAL أو ESTIMATED أو MODELED المعتمد.'
          : 'No fabricated numbers are displayed. Each signal appears only after an approved ACTUAL, ESTIMATED, or MODELED source is connected.'}
      </p>
      <div className="signal-grid">
        {labels.map((label) => (
          <article className="signal-card" key={label}>
            <h3>{label}</h3>
            <p>{locale === 'ar-SA' ? 'بانتظار مصدر موثّق' : 'Awaiting attributed source'}</p>
            <span>ACTUAL · ESTIMATED · MODELED</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function CommandCenter({ locale }: { locale: ProductLocale }) {
  return (
    <section
      className="command-card"
      aria-label={locale === 'ar-SA' ? 'مركز أوامر الذكاء الاصطناعي' : 'AI Command Center'}
    >
      <div>
        <p className="eyebrow">AI Command</p>
        <h2>
          {locale === 'ar-SA'
            ? 'وجّه العمل، ثم راجع قبل التنفيذ'
            : 'Direct work, then review before execution'}
        </h2>
        <p>
          {locale === 'ar-SA'
            ? 'تحتاج الأوامر إلى جلسة مستأجر ومصدر تحكم متصل. لا ترسل هذه الواجهة أي أثر خارجي.'
            : 'Commands require an authenticated tenant session and a connected control source. This interface sends no external side effect.'}
        </p>
      </div>
      <form className="command-form" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="command-input">
          {locale === 'ar-SA' ? 'طلب التشغيل' : 'Operating request'}
        </label>
        <textarea
          id="command-input"
          disabled
          placeholder={
            locale === 'ar-SA' ? 'تتطلب جلسة مؤسسية حقيقية' : 'A real tenant session is required'
          }
          rows={3}
        />
        <button type="submit" disabled>
          {locale === 'ar-SA' ? 'لا يوجد تنفيذ خارجي' : 'No external action executed'}
        </button>
      </form>
    </section>
  );
}

function Onboarding({ locale }: { locale: ProductLocale }) {
  const steps = locale === 'ar-SA'
    ? ['مرحباً ومساحة العمل', 'ملف النشاط', 'أهداف النمو', 'السوق والجمهور', 'القنوات', 'تكاملات المزوّدين', 'تفضيلات الحوكمة', 'مراجعة الجاهزية', 'دخول مساحة عمل النمو']
    : ['Welcome and workspace', 'Business profile', 'Growth goals', 'Market and audience', 'Channels', 'Provider integrations', 'Governance preferences', 'Readiness review', 'Enter Growth Workspace'];
  return <section className="onboarding-card" aria-label={ui(locale, 'Onboarding steps', 'خطوات التهيئة')}><p className="eyebrow">{ui(locale, 'Pilot onboarding', 'تهيئة التجربة')}</p><h2>{ui(locale, 'Start with what is connected', 'ابدأ بما هو متصل')}</h2><p>{ui(locale, 'Partial integrations are supported. Status is evidence-bound: connected, needs configuration, unavailable, disabled, or requires approval.', 'التكاملات الجزئية مدعومة. الحالة مرتبطة بالأدلة: متصل أو يحتاج تهيئة أو غير متاح أو معطل أو يتطلب موافقة.')}</p><ol className="onboarding-steps">{steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol></section>;
}

function GrowthChain({ locale }: { locale: ProductLocale }) {
  const stages = locale === 'ar-SA' ? ['راقب', 'شخّص', 'قرّر', 'حاكي', 'وافق', 'نفّذ', 'تحقق', 'تعلّم'] : ['Observe', 'Diagnose', 'Decide', 'Simulate', 'Approve', 'Execute', 'Verify', 'Learn'];
  return <section className="growth-chain" aria-label={ui(locale, 'Governed growth chain', 'سلسلة النمو المحكومة')}><div className="panel-heading"><div><p className="eyebrow">{ui(locale, 'Growth operating system', 'نظام تشغيل النمو')}</p><h2>{ui(locale, 'Recommendation is not authorization', 'التوصية ليست تفويضاً')}</h2></div><span className="status-pill status-pill--composition-required">{ui(locale, 'Awaiting evidence', 'بانتظار الأدلة')}</span></div><p>{ui(locale, 'AI recommendation, human approval, executed action, and verified result are intentionally distinct states.', 'توصية الذكاء الاصطناعي والموافقة البشرية والإجراء المنفذ والنتيجة المتحقق منها حالات متميزة عمداً.')}</p><ol className="growth-stages">{stages.map((stage) => <li key={stage}>{stage}</li>)}</ol></section>;
}

function ApprovalStates({ locale }: { locale: ProductLocale }) {
  const states = locale === 'ar-SA' ? ['معلق', 'معتمد', 'مرفوض', 'منتهٍ', 'منفذ', 'متحقق', 'فاشل', 'غير مؤكد'] : ['Pending', 'Approved', 'Rejected', 'Expired', 'Executed', 'Verified', 'Failed', 'Uncertain'];
  return <section className="state-card" aria-label={ui(locale, 'Approval states', 'حالات الموافقة')}><h2>{ui(locale, 'Approval state', 'حالة الموافقة')}</h2><p>{ui(locale, 'Decisions are submitted only to the existing server-side approval authority.', 'تُرسل القرارات فقط إلى جهة الموافقة الحالية من جانب الخادم.')}</p><div className="state-list">{states.map((state) => <span key={state}>{state}</span>)}</div></section>;
}

function IntegrationStates({ locale }: { locale: ProductLocale }) {
  const capabilities = locale === 'ar-SA' ? ['إعلام مدفوع', 'CRM', 'بريد إلكتروني', 'SMS', 'WhatsApp'] : ['Paid Media', 'CRM', 'Email', 'SMS', 'WhatsApp'];
  return <section className="state-card" aria-label={ui(locale, 'Integration capabilities', 'قدرات التكامل')}><h2>{ui(locale, 'Capability readiness', 'جاهزية القدرة')}</h2><p>{ui(locale, 'No credential values are rendered. Google, Meta, CRM, and communications remain evidence-bound.', 'لا تُعرض قيم بيانات الاعتماد. تظل Google وMeta وCRM والاتصالات مرتبطة بالأدلة.')}</p><div className="state-list">{capabilities.map((capability) => <span key={capability}>{capability} · {ui(locale, 'Awaiting evidence', 'بانتظار الأدلة')}</span>)}</div></section>;
}

function ViewBody({ view, locale }: { view: ProductView; locale: ProductLocale }) {
  if (view.id === 'overview') {
    return <ExecutiveBoard locale={locale} />;
  }

  if (view.id === 'onboarding') return <Onboarding locale={locale} />;
  if (view.id === 'growth-workspace') return <GrowthChain locale={locale} />;
  if (view.id === 'approvals') return <><ApprovalStates locale={locale} /><SectionGrid view={view} locale={locale} /></>;
  if (view.id === 'integrations') return <><IntegrationStates locale={locale} /><SectionGrid view={view} locale={locale} /></>;

  return <SectionGrid view={view} locale={locale} />;
}

function SectionGrid({ view, locale }: { view: ProductView; locale: ProductLocale }) {
  return (
    <section className="content-grid" aria-label={copy(view.title, locale)}>
      {view.sections.map((section) => (
        <article className="domain-panel" key={section.title.en}>
          <h2>{copy(section.title, locale)}</h2>
          <p>{copy(section.description, locale)}</p>
          <ul>
            {section.items.map((item) => (
              <li key={item.en}>{copy(item, locale)}</li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}

export function ProductShell({ initialView }: ProductShellProps) {
  const [locale, setLocale] = useState<ProductLocale>('en-US');
  const view = useMemo(
    () => productViews.find((candidate) => candidate.id === initialView) ?? productViews[0]!,
    [initialView],
  );
  const access = assessProductAccess(view, signedOutAccess);
  const direction = directionFor(locale);
  const group = productNavigation.find((candidate) => candidate.id === view.group)!;

  return (
    <main className="product-shell" dir={direction} lang={locale === 'ar-SA' ? 'ar' : 'en'}>
      <aside className="sidebar" aria-label={ui(locale, 'Navigation', 'التنقل')}>
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>NAWA Growth OS</span>
        </a>
        <p className="workspace-label">{locale === 'ar-SA' ? 'مساحة نمو محكومة' : 'Governed growth workspace'}</p>
        <a className="onboarding-link" href="/onboarding">{ui(locale, 'Set up workspace', 'إعداد مساحة العمل')}</a>
        <nav>
          {productNavigation.map((group) => (
            <section className="nav-group" key={group.id} aria-label={copy(group.label, locale)}>
              <h2>{copy(group.label, locale)}</h2>
              {group.views.map((viewId) => {
                const item = productViews.find((candidate) => candidate.id === viewId)!;
                return (
                  <a
                    aria-current={item.id === view.id ? 'page' : undefined}
                    className={item.id === view.id ? 'nav-link nav-link--active' : 'nav-link'}
                    href={item.route}
                    key={item.id}
                  >
                    {copy(item.label, locale)}
                  </a>
                );
              })}
            </section>
          ))}
        </nav>
      </aside>

      <div className="application">
        <header className="topbar">
          <div className="context-indicator">
            <span className="status-dot" aria-hidden="true" />
            <span>
              {locale === 'ar-SA' ? 'لا توجد جلسة مستأجر نشطة' : 'No active tenant session'}
            </span>
          </div>
          <span className="workspace-context">{ui(locale, 'Workspace: unavailable', 'مساحة العمل: غير متاحة')}</span>
          <button
            className="locale-switcher"
            onClick={() => setLocale((current) => (current === 'en-US' ? 'ar-SA' : 'en-US'))}
            type="button"
          >
            {locale === 'en-US' ? 'العربية' : 'English'}
          </button>
        </header>

        <div className="page-wrap">
          <header className="page-intro">
            <div>
              <p className="eyebrow">{copy(group.label, locale)}</p>
              <h1>{copy(view.title, locale)}</h1>
              <p>{copy(view.description, locale)}</p>
            </div>
            <div className="guard-card">
              <span>{ui(locale, 'Access and evidence', 'الوصول والأدلة')}</span>
              <strong>
                {access === 'available'
                  ? ui(locale, 'Available', 'متاح')
                  : ui(locale, 'Real session required', 'تتطلب جلسة حقيقية')}
              </strong>
              <p>
                {view.requiredPermission ||
                  ui(locale, 'Tenant role permissions', 'صلاحيات دور المستأجر')}
              </p>
            </div>
          </header>

          <ViewBody locale={locale} view={view} />
          <SourcePanel locale={locale} view={view} />
        </div>
      </div>
    </main>
  );
}
