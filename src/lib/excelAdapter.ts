import type { TradeRow, InitialInventory, DividendRecord, StockSplitRecord, ParsedWorkbook } from './types';
export type { DividendRecord, StockSplitRecord, ParsedWorkbook };

export async function parseExcelFile(file: File): Promise<ParsedWorkbook> {
  const XLSX = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        resolve(parseWorkbook(workbook, XLSX.utils.sheet_to_json.bind(XLSX.utils)));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

type SheetToJson = (sheet: any, opts?: { defval?: any }) => any[];

export function parseWorkbook(workbook: any, sheetToJson: SheetToJson): ParsedWorkbook {
  // Read trades from "证劵-交易流水" sheet
  const tradeSheet = workbook.Sheets['证券-交易流水'] ?? workbook.Sheets[workbook.SheetNames[0]];
  const tradeRows = rawRowsToTrades(sheetToJson(tradeSheet!, { defval: 0 }));

  // Read initial inventory from "证劵-持仓总览" sheet
  const invSheet = workbook.Sheets['证券-持仓总览'];
  let initialInventory: InitialInventory[] = [];
  if (invSheet) {
    const invRows = sheetToJson(invSheet, { defval: 0 });
    initialInventory = parseInitialInventory(invRows);
  }

  // Read dividends from "证劵-资金进出" sheet (类型 = 公司行动)
  const fundSheet = workbook.Sheets['证券-资金进出'];
  let dividends: DividendRecord[] = [];
  if (fundSheet) {
    const fundRows = sheetToJson(fundSheet, { defval: 0 });
    dividends = parseDividends(fundRows);
  }

  // Read stock splits from "证劵-资产进出" sheet (类型 = 公司行动)
  const assetSheet = workbook.Sheets['证券-资产进出'];
  let splits: StockSplitRecord[] = [];
  if (assetSheet) {
    const assetRows = sheetToJson(assetSheet, { defval: 0 });
    splits = parseSplits(assetRows);
  }

  return { tradeRows, initialInventory, dividends, splits };
}

export function parseDate(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel date serial number to YYYY-MM-DD (self-contained, no xlsx dependency)
    // Excel epoch: 1899-12-30 (day 0), with Lotus 1-2-3 leap year bug (day 60 = 1900-02-29)
    const ms = (val - 25569) * 86400 * 1000;
    const utc = new Date(ms);
    const y = utc.getUTCFullYear();
    const m = utc.getUTCMonth() + 1;
    const d = utc.getUTCDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const str = String(val).trim();
  // Handle '20251212' format (8 digits)
  const match = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return str;
}

/** Parse date with time: "2025-12-12 00:00:00" */
export function parseDateTime(val: unknown): string {
  const base = parseDate(val);
  if (!base) return '';
  return `${base} 00:00:00`;
}

function parseNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '');
    return parseFloat(cleaned) || 0;
  }
  return 0;
}

export function rawRowsToTrades(rawRows: any[]): TradeRow[] {
  return rawRows.map((row) => ({
    tradeTime: parseDate(row['成交时间']),
    stockCode: String(row['代码名称'] ?? '').trim(),
    direction: String(row['方向'] ?? '').trim(),
    settlementDate: parseDate(row['交收日期']),
    currency: String(row['币种'] ?? '').trim(),
    quantity: parseNumber(row['数量/面值']),
    price: parseNumber(row['价格']),
    tradeAmount: parseNumber(row['成交金额']),
    totalFees: parseNumber(row['总费用']),
    changeAmount: parseNumber(row['变动金额']),
  }));
}

export function parseInitialInventory(invRows: any[]): InitialInventory[] {
  return invRows
    .filter((row) => String(row['时期类型'] ?? '').trim() === '期初')
    .map((row) => ({
      stockCode: String(row['代码名称'] ?? '').trim(),
      quantity: parseNumber(row['数量/面值']),
      costPerShare: parseNumber(row['价格']),
    }))
    .filter((item) => item.quantity > 0);
}

export function parseDividends(fundRows: any[]): DividendRecord[] {
  return fundRows
    .filter((row) => String(row['类型'] ?? '').trim() === '公司行动')
    .map((row) => {
      const remark = String(row['备注'] ?? '').trim();
      const stockCode = remark.split(/\s+/)[0] || '';
      if (!stockCode) return null;
      const currency = String(row['币种'] ?? '').trim() || undefined;
      const record: DividendRecord = {
        stockCode,
        date: parseDate(row['日期']),
        amount: parseNumber(row['变动金额']),
      };
      if (currency) record.currency = currency;
      return record;
    })
    .filter((r): r is DividendRecord => r !== null);
}

export function parseSplits(assetRows: any[]): StockSplitRecord[] {
  // Filter for 公司行动 rows with SPLIT in remark
  const candidates = assetRows
    .filter((row) => {
      const type = String(row['类型'] ?? '').trim();
      const remark = String(row['备注'] ?? '').trim().toUpperCase();
      return type === '公司行动' && remark.includes('SPLIT');
    })
    .map((row) => ({
      date: parseDateTime(row['日期']),
      stockCode: String(row['代码名称'] ?? '').trim(),
      direction: String(row['方向'] ?? '').trim().toLowerCase(),
      quantity: parseNumber(row['数量']),
    }))
    .filter((r) => r.stockCode && r.quantity !== 0);

  // Group by date + stockCode
  const groups = new Map<string, typeof candidates>();
  for (const r of candidates) {
    const key = `${r.date}|${r.stockCode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  // Find pairs: one "out" row and one "in" row
  const splits: StockSplitRecord[] = [];
  for (const [_, rows] of groups) {
    const outRow = rows.find((r) => r.direction === 'out' || r.direction.includes('出'));
    const inRow = rows.find((r) => r.direction === 'in' || r.direction.includes('进'));
    if (!outRow || !inRow) continue;

    const outQty = Math.abs(outRow.quantity);
    const inQty = Math.abs(inRow.quantity);
    if (outQty <= 0.0001) continue;

    const ratio = inQty / outQty;
    splits.push({ stockCode: outRow.stockCode, date: outRow.date, ratio });
  }

  return splits;
}

