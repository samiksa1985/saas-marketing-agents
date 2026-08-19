export const supportedLocales = ['en', 'ar', 'en-US', 'ar-SA'] as const;
export type Locale = (typeof supportedLocales)[number];
export type Language = 'en' | 'ar';
export type Direction = 'ltr' | 'rtl';

export interface LocaleContext {
  locale: Locale;
  language: Language;
  direction: Direction;
  tenantDefaultLocale: Locale;
  engagementLocale: Locale;
}

export const translations: Record<Locale, Record<string, string>> = {
  en: { 'app.title': 'AI Customer Acquisition Platform', 'app.loading': 'Loading' },
  'en-US': { 'app.title': 'AI Customer Acquisition Platform', 'app.loading': 'Loading' },
  ar: { 'app.title': 'منصة اكتساب العملاء بالذكاء الاصطناعي', 'app.loading': 'جار التحميل' },
  'ar-SA': { 'app.title': 'منصة اكتساب العملاء بالذكاء الاصطناعي', 'app.loading': 'جار التحميل' },
};

export function localeLanguage(locale: Locale): Language {
  return locale.startsWith('ar') ? 'ar' : 'en';
}

export function localeDirection(locale: Locale): Direction {
  return localeLanguage(locale) === 'ar' ? 'rtl' : 'ltr';
}

export function createLocaleContext(
  locale: Locale,
  tenantDefaultLocale: Locale = locale,
): LocaleContext {
  return {
    locale,
    language: localeLanguage(locale),
    direction: localeDirection(locale),
    tenantDefaultLocale,
    engagementLocale: locale,
  };
}

export function translate(locale: Locale, key: string): string {
  return translations[locale][key] ?? translations[localeLanguage(locale)][key] ?? key;
}
