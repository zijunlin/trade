import { describe, it, expect } from 'vitest';
import { parseDividends } from '../lib/excelAdapter';
import { calculateDividends } from '../lib/fifo';

describe('parseDividends', () => {
  it('extracts stock code from first word of 备注 and uses 变动金额', () => {
    const rows = [
      { 类型: '公司行动', 备注: 'AAPL Cash Dividend', 日期: 44927, 变动金额: 100 },
      { 类型: '公司行动', 备注: 'AAPL Dividend Tax', 日期: 44930, 变动金额: -15 },
      { 类型: '交易', 备注: 'MSFT Something', 日期: 44927, 变动金额: 500 },
      { 类型: '公司行动', 备注: '', 日期: 44927, 变动金额: 50 },
    ];
    const dividends = parseDividends(rows);
    expect(dividends).toHaveLength(2);
    expect(dividends[0].stockCode).toBe('AAPL');
    expect(dividends[0].amount).toBe(100);
    expect(dividends[1].amount).toBe(-15);
  });

  it('returns empty array when no matching rows', () => {
    const rows = [
      { 类型: '交易', 备注: 'AAPL Dividend', 日期: 44927, 变动金额: 100 },
    ];
    expect(parseDividends(rows)).toEqual([]);
  });

  it('parses currency field', () => {
    const rows = [
      { 类型: '公司行动', 备注: 'AAPL Dividend', 日期: 44927, 变动金额: 100, 币种: 'USD' },
    ];
    const dividends = parseDividends(rows);
    expect(dividends[0].currency).toBe('USD');
  });
});

describe('calculateDividends', () => {
  it('aggregates income and tax by stock and currency', () => {
    const dividends = [
      { stockCode: 'AAPL', date: '2026-03-15', amount: 100, currency: 'USD' },
      { stockCode: 'AAPL', date: '2026-03-20', amount: -15, currency: 'USD' },
      { stockCode: 'AAPL', date: '2026-04-15', amount: 200, currency: 'USD' },
      { stockCode: 'MSFT', date: '2026-03-15', amount: 50, currency: 'USD' },
    ];
    const result = calculateDividends(dividends);
    expect(result.summaries).toHaveLength(2);
    expect(result.totalCount).toBe(4);

    const aapl = result.summaries.find((s) => s.stockCode === 'AAPL')!;
    expect(aapl.income).toBe(300);
    expect(aapl.tax).toBe(-15);
    expect(aapl.net).toBe(285);
    expect(aapl.incomeCount).toBe(2);
    expect(aapl.taxCount).toBe(1);

    const msft = result.summaries.find((s) => s.stockCode === 'MSFT')!;
    expect(msft.income).toBe(50);
    expect(msft.tax).toBe(0);
    expect(msft.net).toBe(50);
  });

  it('splits same stock by currency', () => {
    const dividends = [
      { stockCode: 'AAPL', date: '2026-03-15', amount: 100, currency: 'USD' },
      { stockCode: 'AAPL', date: '2026-04-15', amount: 80, currency: 'JPY' },
    ];
    const result = calculateDividends(dividends);
    expect(result.summaries).toHaveLength(2);
    expect(result.summaries.some((s) => s.currency === 'USD')).toBe(true);
    expect(result.summaries.some((s) => s.currency === 'JPY')).toBe(true);
  });

  it('handles empty dividends', () => {
    const result = calculateDividends([]);
    expect(result.summaries).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('handles missing currency', () => {
    const dividends = [
      { stockCode: 'AAPL', date: '2026-03-15', amount: 100 },
      { stockCode: 'AAPL', date: '2026-03-20', amount: -10 },
    ];
    const result = calculateDividends(dividends);
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0].currency).toBe('');
    expect(result.summaries[0].income).toBe(100);
    expect(result.summaries[0].tax).toBe(-10);
  });

  it('converts amounts to target currency', () => {
    const dividends = [
      { stockCode: 'AAPL', date: '2025-12-30', amount: 100, currency: 'USD' },
      { stockCode: 'AAPL', date: '2025-12-31', amount: -15, currency: 'USD' },
    ];
    const result = calculateDividends(dividends, '人民币');
    const aapl = result.summaries[0];
    // Rate exists for these dates, converted values should be set
    expect(aapl.convertedIncome).toBeGreaterThan(aapl.income); // 1 USD > 1 CNY
    expect(aapl.convertedTax).toBeLessThan(aapl.tax); // negative tax, converted also negative
    expect(aapl.convertedNet).toBe(aapl.convertedIncome! + aapl.convertedTax!);
  });

  it('same currency as target skips conversion', () => {
    const dividends = [
      { stockCode: 'AAPL', date: '2026-03-15', amount: 100, currency: '人民币' },
    ];
    const result = calculateDividends(dividends, '人民币');
    const aapl = result.summaries[0];
    expect(aapl.convertedIncome).toBe(100); // rate=1, source='same'
    expect(aapl.convertedNet).toBe(100);
    // No conversion needed, sourceCurrency not set
    expect(aapl.sourceCurrency).toBeUndefined();
  });
});
