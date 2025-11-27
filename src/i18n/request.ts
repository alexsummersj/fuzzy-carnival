import { getRequestConfig } from 'next-intl/server';
import { headers, cookies } from 'next/headers';
import { defaultLocale, locales, type Locale } from './config';

export default getRequestConfig(async () => {
  // Get locale from cookie first
  const cookieStore = cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value as Locale;

  if (cookieLocale && locales.includes(cookieLocale)) {
    return {
      locale: cookieLocale,
      messages: (await import(`./messages/${cookieLocale}.json`)).default,
    };
  }

  // Try to get from accept-language header
  const headersList = headers();
  const acceptLanguage = headersList.get('accept-language');

  let locale: Locale = defaultLocale;

  if (acceptLanguage) {
    const preferredLocale = acceptLanguage
      .split(',')[0]
      .split('-')[0]
      .toLowerCase() as Locale;
    if (locales.includes(preferredLocale)) {
      locale = preferredLocale;
    }
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
