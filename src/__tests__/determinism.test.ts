import { describe, it, expect } from 'vitest';
import { calculateFifo, computeFifoSteps } from '../lib/fifo';
import type { TradeRow, InitialInventory, DividendRecord } from '../lib/fifo';
import { calculateDividends } from '../lib/fifo';

function makeTrade(overrides: Partial<TradeRow> = {}): TradeRow {
  return {
    tradeTime: '2026-01-01',
    stockCode: 'AAPL',
    direction: '买入开仓',
    settlementDate: '2026-01-03',
    currency: 'USD',
    quantity: 100,
    price: 150,
    tradeAmount: -15000,
    totalFees: -10,
    changeAmount: -15010,
    ...overrides,
  };
}

describe('determinism: same input always produces same output', () => {
  const trades: TradeRow[] = [
    makeTrade({ tradeTime: '2026-01-10', quantity: 100, tradeAmount: -15000, totalFees: -10 }),
    makeTrade({ tradeTime: '2026-02-15', quantity: 50, tradeAmount: -8000, totalFees: -5 }),
    makeTrade({ tradeTime: '2026-03-20', direction: '卖出平仓', quantity: -120, tradeAmount: 19200, totalFees: -8 }),
    makeTrade({ tradeTime: '2026-04-10', stockCode: 'MSFT', quantity: 200, tradeAmount: -60000, totalFees: -15 }),
    makeTrade({ tradeTime: '2026-05-15', stockCode: 'MSFT', direction: '卖出平仓', quantity: -150, tradeAmount: 48000, totalFees: -12 }),
  ];

  const inventory: InitialInventory[] = [
    { stockCode: 'AAPL', quantity: 30, costPerShare: 140 },
  ];

  it('FIFO result is identical across 100 runs', () => {
    const results = Array.from({ length: 100 }, () =>
      calculateFifo(trades, inventory)
    );

    const first = results[0];
    for (let i = 1; i < results.length; i++) {
      expect(results[i].realizedTrades.map(t => ({
        stockCode: t.stockCode,
        quantity: t.quantity,
        costPerShare: t.costPerShare,
        sellPrice: t.sellPrice,
        realizedPnl: t.realizedPnl,
      }))).toEqual(first.realizedTrades.map(t => ({
        stockCode: t.stockCode,
        quantity: t.quantity,
        costPerShare: t.costPerShare,
        sellPrice: t.sellPrice,
        realizedPnl: t.realizedPnl,
      })));
    }
  });

  it('totalRealizedPnl is always the same', () => {
    const pnls = Array.from({ length: 100 }, () => {
      const result = calculateFifo(trades, inventory);
      return result.realizedTrades.reduce((s, t) => s + t.realizedPnl, 0);
    });

    const unique = [...new Set(pnls)];
    expect(unique).toHaveLength(1);
  });

  it('dividend result is deterministic', () => {
    const dividends: DividendRecord[] = [
      { stockCode: 'AAPL', date: '2026-03-15', amount: 22.5, currency: 'USD' },
      { stockCode: 'AAPL', date: '2026-06-15', amount: 22.5, currency: 'USD' },
      { stockCode: 'AAPL', date: '2026-03-20', amount: -3.375, currency: 'USD' },
      { stockCode: 'MSFT', date: '2026-05-20', amount: 75, currency: 'USD' },
    ];

    const results = Array.from({ length: 50 }, () => calculateDividends(dividends));
    const first = results[0];
    for (let i = 1; i < results.length; i++) {
      expect(results[i].summaries.map(s => ({
        stockCode: s.stockCode,
        income: s.income,
        tax: s.tax,
        net: s.net,
      }))).toEqual(first.summaries.map(s => ({
        stockCode: s.stockCode,
        income: s.income,
        tax: s.tax,
        net: s.net,
      })));
    }
  });

  /**
   * 新架构：预计算所有步骤后，用游标逐步展示。
   * 验证：游标动画遍历所有步骤后的结果与 calculateFifo 一致。
   */
  it('cursor animation from pre-computed steps matches full run', () => {
    const trades: TradeRow[] = [
      makeTrade({ tradeTime: '2026-01-10', quantity: 100, tradeAmount: -15000, totalFees: -10 }),
      makeTrade({ tradeTime: '2026-02-15', quantity: 50, tradeAmount: -8000, totalFees: -5 }),
      makeTrade({ tradeTime: '2026-03-20', direction: '卖出平仓', quantity: -120, tradeAmount: 19200, totalFees: -8 }),
      makeTrade({ tradeTime: '2026-04-10', stockCode: 'MSFT', quantity: 200, tradeAmount: -60000, totalFees: -15 }),
      makeTrade({ tradeTime: '2026-05-15', stockCode: 'MSFT', direction: '卖出平仓', quantity: -150, tradeAmount: 48000, totalFees: -12 }),
    ];

    const fullResult = calculateFifo(trades);
    const { steps, result: fifoResult } = computeFifoSteps(trades);

    // Cursor animation: iterate through all pre-computed steps
    const accumulatedTrades: typeof fullResult.realizedTrades = [];
    const accumulatedUnmatched: typeof fullResult.unmatchedSells = [];
    for (const step of steps) {
      accumulatedTrades.push(...step.realized);
      accumulatedUnmatched.push(...step.unmatched);
    }

    expect(accumulatedTrades.length).toBe(fullResult.realizedTrades.length);
    expect(accumulatedTrades.map(t => t.realizedPnl)).toEqual(
      fullResult.realizedTrades.map(t => t.realizedPnl)
    );
    expect(accumulatedUnmatched).toEqual(fullResult.unmatchedSells);

    // Also verify fifoResult matches
    expect(fifoResult.realizedTrades).toEqual(fullResult.realizedTrades);
    expect(fifoResult.unmatchedSells).toEqual(fullResult.unmatchedSells);
  });
});
