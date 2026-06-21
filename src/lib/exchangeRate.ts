// Exchange rate module: cache-only lookup with forward-search fallback

// Currency code normalization: USD→美元, etc.
const CODE_MAP: Record<string, string> = {
  USD: '美元', USN: '美元', USS: '美元',
  EUR: '欧元',
  GBP: '英镑',
  HKD: '港币',
  JPY: '日元',
  CNY: '人民币', CNH: '人民币',
  SGD: '新加坡元',
  AUD: '澳元',
  CAD: '加元',
  KRW: '韩元',
  NZD: '新西兰元',
  CHF: '瑞士法郎',
  TWD: '新台币',
  INR: '印度卢比',
  THB: '泰铢',
  MYR: '马来西亚林吉特',
  RUB: '俄罗斯卢布',
  ZAR: '南非兰特',
};

export function normalizeCurrency(code: string): string {
  const trimmed = code.trim();
  return CODE_MAP[trimmed] || trimmed;
}

// Rate entry: [baseAmount, fromCurrency, rateValue, toCurrency]
export type RateEntry = [string, string, string, string];

// In-memory cache: date -> RateEntry[]
const cache = new Map<string, RateEntry[]>();

// Seed cache from static JSON data (bundled at build time)
import ratesJson from '../../data/exchangeRates.json';
for (const [date, entries] of Object.entries(ratesJson)) {
  cache.set(date, entries as RateEntry[]);
}

/** Extract date-only part from a date string: "2025-12-13 12:00:00" → "2025-12-13" */
function dateOnly(d: string): string {
  return d.includes(' ') ? d.split(' ')[0] : d;
}

/**
 * Look up a rate from the cache.
 * Strategy: exact date → next date (forward).
 * Returns the rate, base amount, and the actual date used.
 */
function lookupRateWithFallback(date: string, fromCurrency: string, toCurrency: string):
  { rate: number; base: number; actualDate: string } | null {
  const normalizedDate = dateOnly(date);

  // 1. Exact date
  const exact = lookupRateOnDate(normalizedDate, fromCurrency, toCurrency);
  if (exact) return { ...exact, actualDate: normalizedDate };

  // 2. Forward: search next available dates
  return searchNextDate(normalizedDate, fromCurrency, toCurrency);
}

function lookupRateOnDate(date: string, fromCurrency: string, toCurrency: string):
  { rate: number; base: number } | null {
  const entries = cache.get(date);
  if (!entries) return null;
  for (const [baseStr, from, rateStr, to] of entries) {
    if (from === fromCurrency && to === toCurrency) {
      return { rate: parseFloat(rateStr), base: parseFloat(baseStr) };
    }
  }
  return null;
}

function searchNextDate(date: string, fromCurrency: string, toCurrency: string,
): { rate: number; base: number; actualDate: string } | null {
  const sortedDates = [...cache.keys()].sort((a, b) => a.localeCompare(b));
  for (const d of sortedDates) {
    if (d <= date) continue;
    const found = lookupRateOnDate(d, fromCurrency, toCurrency);
    if (found) return { ...found, actualDate: d };
  }
  return null;
}

export type { ConversionInfo } from './types';
import type { ConversionInfo } from './types';

/**
 * Convert an amount from one currency to another using the exchange rate on a given date.
 * Cache-only: exact date → next available date.
 * Returns null if rate not found and currencies differ.
 */
export function convertSync(
  date: string,
  fromCurrency: string,
  fromAmount: number,
  toCurrency: string = '人民币',
): ConversionInfo | null {
  const fromNorm = normalizeCurrency(fromCurrency);
  const toNorm = normalizeCurrency(toCurrency);

  if (fromNorm === toNorm) {
    return { date, rateDate: date, fromCurrency: fromNorm, toCurrency: toNorm, fromAmount, rate: 1, convertedAmount: fromAmount, source: 'same' };
  }

  const cached = lookupRateWithFallback(date, fromNorm, toNorm);
  if (!cached) return null;

  const ratePerUnit = cached.rate / cached.base;
  return {
    date, rateDate: cached.actualDate,
    fromCurrency: fromNorm, toCurrency: toNorm, fromAmount,
    rate: ratePerUnit, convertedAmount: fromAmount * ratePerUnit,
    source: cached.actualDate === date ? 'cache' : 'fallback',
  };
}
