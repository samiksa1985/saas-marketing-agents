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
  const source = view.dataSources[0]!;
  const unavailable = unavailableState(view);
  const status =
    source.status === 'available'
      ? ui(locale, 'Available', 'متاح')
      : ui(locale, 'Unavailable', 'غير متاح');

  return (
    <aside className="source-panel" aria-label={ui(locale, 'Source status', 'حالة المصدر')}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{ui(locale, 'Canonical source', 'المصدر القانوني')}</p>
          <h2>{copy(source.label, locale)}</h2>
        </div>
        <span className={`status-pill status-pill--${source.status}`}>{status}</span>
      </div>
      <p>{copy(view.description, locale)}</p>
      <code>{source.endpoint}</code>
      {source.status === 'composition-required' && unavailable.kind === 'unavailable' ? (
        <p className="honesty-note">{copy(unavailable.message, locale)}</p>
      ) : null}
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

function ViewBody({ view, locale }: { view: ProductView; locale: ProductLocale }) {
  if (view.id === 'home') {
    return <ExecutiveBoard locale={locale} />;
  }

  if (view.id === 'ai-command') {
    return <CommandCenter locale={locale} />;
  }

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
          <span>AI Marketing OS</span>
        </a>
        <p className="workspace-label">
          {locale === 'ar-SA' ? 'مساحة تشغيل مؤسسية' : 'Enterprise operating workspace'}
        </p>
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
              <span>{ui(locale, 'Canonical guard', 'حارس قانوني')}</span>
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
