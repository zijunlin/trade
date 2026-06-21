/**
 * Fetch exchange rates from SAFE API for specified years and save to data/exchangeRates.json
 *
 * Usage:
 *   npx tsx scripts/fetchRates.ts 2025
 *   npx tsx scripts/fetchRates.ts 2024 2025
 *   npx tsx scripts/fetchRates.ts 2023 2024 2025
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, '../data/exchangeRates.json');
const API_URL = 'http://m.safe.gov.cn/AppStructured/hlw/jsonRmb.do?date=';
const DELAY_MS = 2000;

type RateEntry = [string, string, string, string];

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function datesInYear(year: number): string[] {
  const dates: string[] = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(formatDate(d));
  }
  return dates;
}

async function fetchRatesForDate(date: string): Promise<RateEntry[] | null> {
  try {
    const resp = await fetch(`${API_URL}${date}`);
    if (!resp.ok) {
      console.log(`  ${date}: HTTP ${resp.status}`);
      return null;
    }
    const data: unknown[] = await resp.json();
    if (!data || data.length === 0) {
      console.log(`  ${date}: no data`);
      return null;
    }
    const entries: RateEntry[] = data.map((item: unknown[]) => [
      String(item[0]),
      String(item[1]),
      String(item[2]),
      String(item[3]),
    ]);
    console.log(`  ${date}: ${data.length} currencies (${data.map((d: unknown[]) => d[1]).join(', ')})`);
    return entries;
  } catch (err: unknown) {
    console.log(`  ${date}: error - ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

function saveData(data: Record<string, RateEntry[]>) {
  const sorted = Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => b.localeCompare(a))
  );
  fs.writeFileSync(DATA_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
}

function parseArgs(): number[] {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/fetchRates.ts <year1> [year2] ...');
    console.error('Example: npx tsx scripts/fetchRates.ts 2024 2025');
    process.exit(1);
  }
  const years = args.map((a) => parseInt(a, 10)).filter((y) => !isNaN(y) && y >= 1900 && y <= 2100);
  if (years.length === 0) {
    console.error('Error: No valid years provided. Use 4-digit years like 2025.');
    process.exit(1);
  }
  return [...new Set(years)].sort();
}

async function main() {
  const years = parseArgs();
  console.log(`Fetching rates for years: ${years.join(', ')}`);

  // Load existing data
  let existingData: Record<string, RateEntry[]> = {};
  if (fs.existsSync(DATA_FILE)) {
    try {
      existingData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      console.log(`Loaded ${Object.keys(existingData).length} existing dates`);
    } catch {
      console.log('Failed to parse existing data, starting fresh');
    }
  }

  // Collect all dates across requested years, skip existing ones
  const allDates: string[] = [];
  for (const year of years) {
    const dates = datesInYear(year);
    allDates.push(...dates);
  }
  console.log(`Total dates across all years: ${allDates.length}`);

  let fetched = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < allDates.length; i++) {
    const date = allDates[i];
    if (existingData[date]) {
      skipped++;
      continue;
    }

    const entries = await fetchRatesForDate(date);
    if (entries) {
      existingData[date] = entries;
      fetched++;
      saveData(existingData);
    } else {
      errors++;
    }

    // Wait between requests (skip delay on last item)
    if (i < allDates.length - 1) {
      await delay(DELAY_MS);
    }
  }

  console.log(`\nDone! Fetched: ${fetched}, Skipped: ${skipped}, Errors/NoData: ${errors}`);
  console.log(`Total dates in file: ${Object.keys(existingData).length}`);
}

main().catch(console.error);
