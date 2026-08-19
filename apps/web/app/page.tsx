import { translations } from '@platform/i18n';

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">Foundation shell</p>
      <h1>{translations.en['app.title']}</h1>
      <p>Tenant-scoped workflow orchestration with evidence-bounded approvals.</p>
      <div className="locale-grid">
        <span lang="en">{translations['en-US']['app.title']}</span>
        <span lang="ar" dir="rtl">
          {translations['ar-SA']['app.title']}
        </span>
      </div>
    </main>
  );
}
