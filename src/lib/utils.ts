import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for merging Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency with proper locale
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format area with unit
 */
export function formatArea(
  area: number,
  unit: 'sqm' | 'sqft' = 'sqft',
  locale: string = 'en-US'
): string {
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(area);
  return `${formatted} ${unit === 'sqm' ? 'm²' : 'ft²'}`;
}

/**
 * Format date for display
 */
export function formatDate(
  date: Date | string,
  locale: string = 'en-US',
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, options || { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Convert square meters to square feet
 */
export function sqmToSqft(sqm: number): number {
  return Math.round(sqm * 10.7639);
}

/**
 * Convert square feet to square meters
 */
export function sqftToSqm(sqft: number): number {
  return Math.round(sqft / 10.7639);
}

/**
 * Normalize string for comparison (lowercase, trim, remove extra spaces)
 */
export function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extract numbers from string
 */
export function extractNumber(str: string): number | null {
  const match = str.match(/[\d,]+\.?\d*/);
  if (match) {
    return parseFloat(match[0].replace(/,/g, ''));
  }
  return null;
}

/**
 * Generate a slug from string
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Get traffic light color based on score
 */
export function getTrafficLightColor(score: number): 'green' | 'yellow' | 'red' {
  if (score <= 35) return 'green';
  if (score <= 65) return 'yellow';
  return 'red';
}

/**
 * Delay execution
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + '...';
}
