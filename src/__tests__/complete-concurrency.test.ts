import { describe, it, expect } from 'vitest';
import { calculateFifo, computeFifoSteps } from '../lib/fifo';
import type { TradeRow } from '../lib/fifo';

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

/**
 * 验证新架构：先计算所有步骤，再用游标动画展示。
 * computeFifoSteps 返回的步骤数组应该与 calculateFifo 的结果完全一致。
 */
describe('computeFifoSteps: pre-compute then animate', () => {
  it('steps match full FIFO result', () => {
    const trades: TradeRow[] = [
      makeTrade({ tradeTime: '2026-01-10', quantity: 100, tradeAmount: -15000, totalFees: -10 }),
      makeTrade({ tradeTime: '2026-02-15', quantity: 50, tradeAmount: -8000, totalFees: -5 }),
      makeTrade({ tradeTime: '2026-03-20', direction: '卖出平仓', quantity: -120, tradeAmount: 19200, totalFees: -8 }),
      makeTrade({ tradeTime: '2026-04-10', stockCode: 'MSFT', quantity: 200, tradeAmount: -60000, totalFees: -15 }),
      makeTrade({ tradeTime: '2026-05-15', stockCode: 'MSFT', direction: '卖出平仓', quantity: -150, tradeAmount: 48000, totalFees: -12 }),
    ];

    const fullResult = calculateFifo(trades);
    const { steps, result: fifoResult } = computeFifoSteps(trades);

    // FIFO result matches
    expect(fifoResult.realizedTrades.length).toBe(fullResult.realizedTrades.length);
    expect(fifoResult.realizedTrades.map(t => t.realizedPnl)).toEqual(
      fullResult.realizedTrades.map(t => t.realizedPnl)
    );
    expect(fifoResult.unmatchedSells.length).toBe(fullResult.unmatchedSells.length);

    // Steps contain all FIFO operations
    const allRealizedFromSteps = steps.flatMap(s => s.realized);
    expect(allRealizedFromSteps.length).toBe(fifoResult.realizedTrades.length);
  });

  it('cursor animation simulation produces correct result', () => {
    const trades: TradeRow[] = [
      makeTrade({ tradeTime: '2026-01-10', quantity: 100, tradeAmount: -15000, totalFees: -10 }),
      makeTrade({ tradeTime: '2026-03-20', direction: '卖出平仓', quantity: -100, tradeAmount: 16000, totalFees: -9 }),
    ];

    const { steps, result: fifoResult } = computeFifoSteps(trades);

    // Simulate cursor animation
    const accumulatedTrades: typeof fifoResult.realizedTrades = [];
    const accumulatedUnmatched: typeof fifoResult.unmatchedSells = [];
    for (const step of steps) {
      accumulatedTrades.push(...step.realized);
      accumulatedUnmatched.push(...step.unmatched);
    }

    expect(accumulatedTrades.length).toBe(fifoResult.realizedTrades.length);
    expect(accumulatedUnmatched.length).toBe(fifoResult.unmatchedSells.length);
  });

  it('complete skips animation delay but still processes all steps', () => {
    const trades: TradeRow[] = [
      makeTrade({ tradeTime: '2026-01-10', quantity: 100, tradeAmount: -15000, totalFees: -10 }),
      makeTrade({ tradeTime: '2026-02-15', quantity: 50, tradeAmount: -8000, totalFees: -5 }),
      makeTrade({ tradeTime: '2026-03-20', direction: '卖出平仓', quantity: -120, tradeAmount: 19200, totalFees: -8 }),
    ];

    const { steps, result: fifoResult } = computeFifoSteps(trades);

    // Simulate "complete" — process all steps without delay
    const accumulatedTrades: typeof fifoResult.realizedTrades = [];
    for (const step of steps) {
      accumulatedTrades.push(...step.realized);
    }

    // All trades processed
    expect(accumulatedTrades.length).toBe(fifoResult.realizedTrades.length);
    const totalPnl = accumulatedTrades.reduce((s, t) => s + t.realizedPnl, 0);
    const expectedPnl = fifoResult.realizedTrades.reduce((s, t) => s + t.realizedPnl, 0);
    expect(totalPnl).toBe(expectedPnl);
  });

  it('empty trades produces zero steps', () => {
    const { steps, result } = computeFifoSteps([]);
    expect(steps).toHaveLength(0);
    expect(result.realizedTrades).toHaveLength(0);
  });
});
