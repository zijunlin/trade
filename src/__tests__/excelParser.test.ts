import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook, parseDate, rawRowsToTrades, parseInitialInventory } from '../lib/excelAdapter';

function createWorkbook(sheets: Record<string, any[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const headers = rows[0];
    const data = rows.slice(1).map((row) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return wb;
}

describe('parseDate', () => {
  it('parses string date', () => {
    expect(parseDate('2026-01-10')).toBe('2026-01-10');
  });

  it('parses Excel serial number', () => {
    // Excel serial 46770 = 2028-01-01 (approximate)
    const result = parseDate(46770);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns empty for null/undefined', () => {
    expect(parseDate(null)).toBe('');
    expect(parseDate(undefined)).toBe('');
  });
});

describe('rawRowsToTrades', () => {
  it('parses trade row with all fields', () => {
    const rows = [{
      '成交时间': '2026-01-10',
      '代码名称': 'AAPL',
      '方向': '买入开仓',
      '交收日期': '2026-01-12',
      '币种': 'USD',
      '数量/面值': 100,
      '价格': 150.00,
      '成交金额': -15000,
      '总费用': -10,
      '变动金额': -15010,
    }];
    const trades = rawRowsToTrades(rows);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toEqual({
      tradeTime: '2026-01-10',
      stockCode: 'AAPL',
      direction: '买入开仓',
      settlementDate: '2026-01-12',
      currency: 'USD',
      quantity: 100,
      price: 150,
      tradeAmount: -15000,
      totalFees: -10,
      changeAmount: -15010,
    });
  });

  it('handles missing fields with defaults', () => {
    const trades = rawRowsToTrades([{}]);
    expect(trades[0].stockCode).toBe('');
    expect(trades[0].direction).toBe('');
    expect(trades[0].quantity).toBe(0);
    expect(trades[0].tradeTime).toBe('');
  });

  it('parses string numbers with commas', () => {
    const rows = [{
      '成交时间': '2026-01-10',
      '代码名称': 'MSFT',
      '方向': '卖出平仓',
      '数量/面值': '1,000',
      '价格': '300.50',
      '成交金额': '-300,500',
    }];
    const trades = rawRowsToTrades(rows);
    expect(trades[0].quantity).toBe(1000);
    expect(trades[0].price).toBe(300.5);
    expect(trades[0].tradeAmount).toBe(-300500);
  });
});

describe('parseInitialInventory', () => {
  it('filters only 期初 rows', () => {
    const rows = [
      { '时期类型': '期初', '代码名称': 'AAPL', '数量/面值': 100, '价格': 150 },
      { '时期类型': '期末', '代码名称': 'AAPL', '数量/面值': 20, '价格': 160 },
    ];
    const inv = parseInitialInventory(rows);
    expect(inv).toHaveLength(1);
    expect(inv[0]).toEqual({ stockCode: 'AAPL', quantity: 100, costPerShare: 150 });
  });

  it('filters out zero quantity', () => {
    const rows = [
      { '时期类型': '期初', '代码名称': 'GOOG', '数量/面值': 0, '价格': 100 },
      { '时期类型': '期初', '代码名称': 'META', '数量/面值': 50, '价格': 200 },
    ];
    const inv = parseInitialInventory(rows);
    expect(inv).toHaveLength(1);
    expect(inv[0].stockCode).toBe('META');
  });

  it('handles empty rows', () => {
    expect(parseInitialInventory([])).toEqual([]);
  });
});

describe('parseWorkbook', () => {
  it('reads trades from 证券-交易流水 sheet', () => {
    const wb = createWorkbook({
      '证券-交易流水': [
        ['成交时间', '代码名称', '方向', '交收日期', '币种', '数量/面值', '价格', '成交金额', '总费用', '变动金额'],
        ['2026-01-10', 'AAPL', '买入开仓', '2026-01-12', 'USD', 100, 150, -15000, -10, -15010],
        ['2026-03-20', 'AAPL', '卖出平仓', '2026-03-22', 'USD', -80, 160, 12800, -9, 12791],
      ],
    });
    const result = parseWorkbook(wb, XLSX.utils.sheet_to_json.bind(XLSX.utils));
    expect(result.tradeRows).toHaveLength(2);
    expect(result.tradeRows[0].direction).toBe('买入开仓');
    expect(result.tradeRows[1].direction).toBe('卖出平仓');
  });

  it('falls back to first sheet when 证券-交易流水 does not exist', () => {
    const wb = createWorkbook({
      'Sheet1': [
        ['成交时间', '代码名称', '方向', '交收日期', '币种', '数量/面值', '价格', '成交金额', '总费用', '变动金额'],
        ['2026-01-10', 'AAPL', '买入开仓', '2026-01-12', 'USD', 100, 150, -15000, -10, -15010],
      ],
    });
    const result = parseWorkbook(wb, XLSX.utils.sheet_to_json.bind(XLSX.utils));
    expect(result.tradeRows).toHaveLength(1);
  });

  it('reads initial inventory from 证券-持仓总览 sheet', () => {
    const wb = createWorkbook({
      '证券-交易流水': [
        ['成交时间', '代码名称', '方向', '交收日期', '币种', '数量/面值', '价格', '成交金额', '总费用', '变动金额'],
        ['2026-03-20', 'AAPL', '卖出平仓', '2026-03-22', 'USD', -80, 160, 12800, -9, 12791],
      ],
      '证券-持仓总览': [
        ['时期类型', '日期', '品类', '代码名称', '币种', '数量/面值', '价格'],
        ['期初', '2026-01-01', '股票', 'AAPL', 'USD', 100, 150],
        ['期末', '2026-12-31', '股票', 'AAPL', 'USD', 20, 160],
      ],
    });
    const result = parseWorkbook(wb, XLSX.utils.sheet_to_json.bind(XLSX.utils));
    expect(result.initialInventory).toHaveLength(1);
    expect(result.initialInventory[0]).toEqual({ stockCode: 'AAPL', quantity: 100, costPerShare: 150 });
  });

  it('returns empty inventory when 证券-持仓总览 sheet does not exist', () => {
    const wb = createWorkbook({
      '证券-交易流水': [
        ['成交时间', '代码名称', '方向', '交收日期', '币种', '数量/面值', '价格', '成交金额', '总费用', '变动金额'],
        ['2026-01-10', 'AAPL', '买入开仓', '2026-01-12', 'USD', 100, 150, -15000, -10, -15010],
      ],
    });
    const result = parseWorkbook(wb, XLSX.utils.sheet_to_json.bind(XLSX.utils));
    expect(result.initialInventory).toEqual([]);
  });
});
