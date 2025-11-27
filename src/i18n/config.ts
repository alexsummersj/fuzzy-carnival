/**
 * i18n Configuration
 * Defines supported languages and locale settings
 */

export const locales = [
  'en',  // English
  'ru',  // Russian
  'ar',  // Arabic
  'zh',  // Chinese
  'fr',  // French
  'de',  // German
  'es',  // Spanish
  'it',  // Italian
  'pt',  // Portuguese
  'hi',  // Hindi
  'ja',  // Japanese
  'ko',  // Korean
  'tr',  // Turkish
  'nl',  // Dutch
  'pl',  // Polish
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
  ar: 'العربية',
  zh: '中文',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  hi: 'हिन्दी',
  ja: '日本語',
  ko: '한국어',
  tr: 'Türkçe',
  nl: 'Nederlands',
  pl: 'Polski',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇬🇧',
  ru: '🇷🇺',
  ar: '🇸🇦',
  zh: '🇨🇳',
  fr: '🇫🇷',
  de: '🇩🇪',
  es: '🇪🇸',
  it: '🇮🇹',
  pt: '🇵🇹',
  hi: '🇮🇳',
  ja: '🇯🇵',
  ko: '🇰🇷',
  tr: '🇹🇷',
  nl: '🇳🇱',
  pl: '🇵🇱',
};

// RTL languages
export const rtlLocales: Locale[] = ['ar'];

export function isRTL(locale: Locale): boolean {
  return rtlLocales.includes(locale);
}

// Date format locales for Intl
export const dateLocales: Record<Locale, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  ar: 'ar-SA',
  zh: 'zh-CN',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  hi: 'hi-IN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  tr: 'tr-TR',
  nl: 'nl-NL',
  pl: 'pl-PL',
};

// Currency defaults by locale
export const localeCurrencies: Record<Locale, string> = {
  en: 'USD',
  ru: 'RUB',
  ar: 'AED',
  zh: 'CNY',
  fr: 'EUR',
  de: 'EUR',
  es: 'EUR',
  it: 'EUR',
  pt: 'EUR',
  hi: 'INR',
  ja: 'JPY',
  ko: 'KRW',
  tr: 'TRY',
  nl: 'EUR',
  pl: 'PLN',
};
