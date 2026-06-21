import { describe, it, expect } from 'vitest';
import { calculateFifo } from '../lib/fifo';
import type { TradeRow, InitialInventory } from '../lib/fifo';

function makeTrade(overrides: Partial<TradeRow> = {}): TradeRow {
  return {
    tradeTime: '2026-01-01',
    stockCode: 'TEST',
    direction: '买入开仓',
    settlementDate: '2026-01-03',
    currency: 'USD',
    quantity: 100,
    price: 10,
    tradeAmount: -1000,
    totalFees: -5,
    changeAmount: -1005,
    ...overrides,
  };
}

describe('calculateFifo', () => {
  it('simple buy then sell with profit', () => {
    const trades: TradeRow[] = [
      makeTrade({ tradeTime: '2026-01-10', stockCode: 'AAPL', quantity: 100, tradeAmount: -15000, totalFees: -10 }),
      makeTrade({ tradeTime: '2026-03-20', stockCode: 'AAPL', direction: '卖出平仓', quantity: -100, tradeAmount: 16000, totalFees: -9 }),
    ];
    const result = calculateFifo(trades);
    expect(result.realizedTrades).toHaveLength(1);
    expect(result.realizedTrades[0].quantity).toBe(100);
    expect(result.realizedTrades[0].realizedPnl).toBeGreaterThan(0);
    expect(result.unmatchedSells).toHaveLength(0);
  });

  it('sell without any buy produces unmatched sell', () => {
    const trades: TradeRow[] = [
      makeTrade({ tradeTime: '2026-03-20', stockCode: 'AAPL', direction: '卖出平仓', quantity: -100, tradeAmount: 16000, totalFees: -9 }),
    ];
    const result = calculateFifo(trades);
    expect(result.realizedTrades).toHaveLength(0);
    expect(result.unmatchedSells).toHaveLength(1);
    expect(result.unmatchedSells[0].quantity).toBe(100);
  });

  it('initial inventory covers a sell', () => {
    const trades: TradeRow[] = [
      makeTrade({ tradeTime: '2026-03-20', stockCode: 'AAPL', direction: '卖出平仓', quantity: -50, tradeAmount: 8000, totalFees: -5 }),
    ];
    const inventory: InitialInventory[] = [
      { stockCode: 'AAPL', quantity: 100, costPerShare: 150 },
    ];
    const result = calculateFifo(trades, inventory);
    expect(result.realizedTrades).toHaveLength(1);
    expect(result.realizedTrades[0].buyTime).toBe('初始库存');
    expect(result.realizedTrades[0].costPerShare).toBe(150);
    expect(result.unmatchedSells).toHaveLength(0);
  });

  it('FIFO order: initial inventory first, then buys', () => {
    // Initial: 50 @ 140, Buy: 100 @ 150, Sell: 120
    // Should consume 50 from initial + 70 from buy
    const trades: TradeRow[] = [
      makeTrade({ tradeTime: '2026-02-10', stockCode: 'AAPL', quantity: 100, tradeAmount: -15000, totalFees: -10 }),
      makeTrade({ tradeTime: '2026-03-20', stockCode: 'AAPL', direction: '卖出平仓', quantity: -120, tradeAmount: 19200, totalFees: -8 }),
    ];
    const inventory: InitialInventory[] = [
      { stockCode: 'AAPL', quantity: 50, costPerShare: 140 },
    ];
    const result = calculateFifo(trades, inventory);
    expect(result.realizedTrades).toHaveLength(2);
    // First layer: initial inventory (50)
    expect(result.realizedTrades[0].buyTime).toBe('初始库存');
    expect(result.realizedTrades[0].quantity).toBe(50);
    expect(result.realizedTrades[0].costPerShare).toBe(140);
    // Second layer: buy (70)
    expect(result.realizedTrades[1].buyTime).toBe('2026-02-10');
    expect(result.realizedTrades[1].quantity).toBe(70);
    expect(result.unmatchedSells).toHaveLength(0);
  });

  it('partial initial inventory consumption', () => {
    const trades: TradeRow[] = [
      // Sell 150, but initial inventory only has 100
      makeTrade({ tradeTime: '2026-03-20', stockCode: 'AAPL', direction: '卖出平仓', quantity: -150, tradeAmount: 24000, totalFees: -10 }),
    ];
    const inventory: InitialInventory[] = [
      { stockCode: 'AAPL', quantity: 100, costPerShare: 150 },
    ];
    const result = calculateFifo(trades, inventory);
    expect(result.realizedTrades).toHaveLength(1);
    expect(result.realizedTrades[0].quantity).toBe(100);
    expect(result.unmatchedSells).toHaveLength(1);
    expect(result.unmatchedSells[0].quantity).toBe(50);
  });

  it('FIFO order: first buy consumed first', () => {
    const trades: TradeRow[] = [
      makeTrade({ tradeTime: '2026-01-10', stockCode: 'AAPL', quantity: 50, tradeAmount: -7500, totalFees: -5 }),
      makeTrade({ tradeTime: '2026-02-10', stockCode: 'AAPL', quantity: 50, tradeAmount: -8000, totalFees: -5 }),
      makeTrade({ tradeTime: '2026-03-20', stockCode: 'AAPL', direction: '卖出平仓', quantity: -70, tradeAmount: 11200, totalFees: -7 }),
    ];
    const result = calculateFifo(trades);
    expect(result.realizedTrades).toHaveLength(2);
    // First 50 from Jan buy, next 20 from Feb buy
    expect(result.realizedTrades[0].quantity).toBe(50);
    expect(result.realizedTrades[1].quantity).toBe(20);
    expect(result.unmatchedSells).toHaveLength(0);
  });

  it('handles negative quantity buy (sell) with positive direction string', () => {
    const trades: TradeRow[] = [
      makeTrade({ tradeTime: '2026-03-20', stockCode: 'AAPL', direction: '卖出平仓', quantity: -100, tradeAmount: 16000, totalFees: -9 }),
    ];
    const inventory: InitialInventory[] = [
      { stockCode: 'AAPL', quantity: 100, costPerShare: 150 },
    ];
    const result = calculateFifo(trades, inventory);
    expect(result.realizedTrades).toHaveLength(1);
  });

  it('multiple stocks are independent', () => {
    const trades: TradeRow[] = [
      makeTrade({ tradeTime: '2026-01-10', stockCode: 'AAPL', quantity: 100, tradeAmount: -15000, totalFees: -10 }),
      makeTrade({ tradeTime: '2026-01-10', stockCode: 'MSFT', quantity: 50, tradeAmount: -15000, totalFees: -10 }),
      makeTrade({ tradeTime: '2026-03-20', stockCode: 'AAPL', direction: '卖出平仓', quantity: -100, tradeAmount: 16000, totalFees: -9 }),
      makeTrade({ tradeTime: '2026-03-20', stockCode: 'MSFT', direction: '卖出平仓', quantity: -50, tradeAmount: 16000, totalFees: -9 }),
    ];
    const result = calculateFifo(trades);
    expect(result.realizedTrades).toHaveLength(2);
    expect(result.unmatchedSells).toHaveLength(0);
  });

  it('trades are sorted by time regardless of input order', () => {
    const trades: TradeRow[] = [
      // Sell comes before buy in input
      makeTrade({ tradeTime: '2026-03-20', stockCode: 'AAPL', direction: '卖出平仓', quantity: -100, tradeAmount: 16000, totalFees: -9 }),
      makeTrade({ tradeTime: '2026-01-10', stockCode: 'AAPL', quantity: 100, tradeAmount: -15000, totalFees: -10 }),
    ];
    const result = calculateFifo(trades);
    // After sorting, buy comes first, so sell is matched
    expect(result.realizedTrades).toHaveLength(1);
    expect(result.unmatchedSells).toHaveLength(0);
  });
});
