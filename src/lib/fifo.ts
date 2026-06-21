import type { DividendRecord, StockSplitRecord, TradeRow, InitialInventory, RealizedTrade, UnmatchedSell, FifoResult, FifoStep, DividendSummary, DividendResult } from './types';
import { convertSync } from './exchangeRate';
import { exportToExcel } from './excelExporter';
export { exportToExcel } from './excelExporter';
export { parseExcelFile, parseDate, rawRowsToTrades, parseDividends, parseSplits, type ParsedWorkbook, type DividendRecord, type StockSplitRecord } from './excelAdapter';

// Re-export types
export type { TradeRow, RealizedTrade, InitialInventory, UnmatchedSell, FifoResult, FifoStep, TaxCalculationResult, DividendSummary, DividendResult } from './types';

// ==================== Private types ====================

interface FifoLayer {
  quantity: number;
  unitCost: number;
  buyTime: string;
}

type FifoEvent =
  | { type: 'trade'; data: TradeRow }
  | { type: 'split'; data: StockSplitRecord };

// ==================== Trade math helpers ====================

function calcBuyCostPerShare(trade: TradeRow): number {
  const qty = Math.abs(trade.quantity);
  if (qty === 0) return 0;
  return (Math.abs(trade.tradeAmount) + Math.abs(trade.totalFees)) / qty;
}

function calcSellPricePerShare(trade: TradeRow): number {
  const qty = Math.abs(trade.quantity);
  if (qty === 0) return Math.abs(trade.price);
  return (Math.abs(trade.tradeAmount) - Math.abs(trade.totalFees)) / qty;
}

// ==================== Event building ====================

function sortTrades(trades: TradeRow[]): TradeRow[] {
  return [...trades].sort((a, b) => {
    const cmp = a.stockCode.localeCompare(b.stockCode);
    return cmp !== 0 ? cmp : a.tradeTime.localeCompare(b.tradeTime);
  });
}

function groupSplitsByStock(splits: StockSplitRecord[]): Map<string, StockSplitRecord[]> {
  const map = new Map<string, StockSplitRecord[]>();
  for (const s of splits) {
    if (!map.has(s.stockCode)) map.set(s.stockCode, []);
    map.get(s.stockCode)!.push(s);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
  }
  return map;
}

function buildEvents(trades: TradeRow[], splits: StockSplitRecord[]): FifoEvent[] {
  const sortedTrades = sortTrades(trades);
  const splitsByStock = groupSplitsByStock(splits);
  const stockCodes = [...new Set([...sortedTrades.map((t) => t.stockCode), ...splitsByStock.keys()])].sort();

  const events: FifoEvent[] = [];
  for (const code of stockCodes) {
    const stockTrades = sortedTrades.filter((t) => t.stockCode === code);
    const stockSplits = splitsByStock.get(code) || [];

    let ti = 0, si = 0;
    while (ti < stockTrades.length || si < stockSplits.length) {
      if (si >= stockSplits.length || (ti < stockTrades.length && stockTrades[ti].tradeTime <= stockSplits[si].date)) {
        events.push({ type: 'trade', data: stockTrades[ti++] });
      } else {
        events.push({ type: 'split', data: stockSplits[si++] });
      }
    }
  }
  return events;
}

// ==================== FIFO queue operations ====================

function seedInventory(queues: Map<string, FifoLayer[]>, inventory: InitialInventory[]): void {
  for (const inv of inventory) {
    if (!queues.has(inv.stockCode)) queues.set(inv.stockCode, []);
    queues.get(inv.stockCode)!.push({
      quantity: inv.quantity,
      unitCost: inv.costPerShare,
      buyTime: '初始库存',
    });
  }
}

function ensureQueue(queues: Map<string, FifoLayer[]>, stockCode: string): FifoLayer[] {
  if (!queues.has(stockCode)) queues.set(stockCode, []);
  return queues.get(stockCode)!;
}

// ==================== Split processing ====================

function processSplit(queues: Map<string, FifoLayer[]>, split: StockSplitRecord): void {
  const layers = ensureQueue(queues, split.stockCode);
  if (layers.length === 0) return;

  const ratio = split.ratio;
  for (const layer of layers) {
    layer.quantity *= ratio;
    layer.unitCost /= ratio;
    layer.buyTime = `拆股(${split.date})`;
  }
}

// ==================== Trade processing ====================

function processBuy(layers: FifoLayer[], trade: TradeRow): void {
  layers.push({
    quantity: Math.abs(trade.quantity),
    unitCost: calcBuyCostPerShare(trade),
    buyTime: trade.tradeTime,
  });
}

function processSell(
  layers: FifoLayer[],
  trade: TradeRow,
  stockCode: string,
  targetCurrency: string,
): { realized: RealizedTrade[]; unmatched: UnmatchedSell[] } {
  const realized: RealizedTrade[] = [];
  const unmatched: UnmatchedSell[] = [];
  const sellQty = Math.abs(trade.quantity);
  const sellPrice = calcSellPricePerShare(trade);

  let remaining = sellQty;
  while (remaining > 0 && layers.length > 0) {
    const layer = layers[0];
    if (!layer) break;

    const consumeQty = Math.min(remaining, layer.quantity);
    const pnl = consumeQty * (sellPrice - layer.unitCost);
    const positionBefore = layers.reduce((s, l) => s + l.quantity, 0);

    layer.quantity -= consumeQty;
    remaining -= consumeQty;
    if (layer.quantity <= 0.0001) layers.shift();

    // 汇率换算：将 realizedPnl 转换为目标币种
    const info = convertSync(trade.tradeTime, trade.currency, pnl, targetCurrency);

    realized.push({
      stockCode, buyTime: layer.buyTime, sellTime: trade.tradeTime,
      quantity: consumeQty, costPerShare: layer.unitCost,
      sellPrice, realizedPnl: pnl, positionBefore,
      convertedPnl: info ? info.convertedAmount : undefined,
      exchangeRate: info ? info.rate : undefined,
      sourceCurrency: info ? info.fromCurrency : undefined,
    });
  }

  if (remaining > 0) {
    unmatched.push({ stockCode, sellTime: trade.tradeTime, quantity: remaining, sellPrice });
  }

  return { realized, unmatched };
}

function createSplitTradeRow(split: StockSplitRecord): TradeRow {
  return {
    tradeTime: split.date, stockCode: split.stockCode,
    direction: `拆股(1:${split.ratio.toFixed(2)})`,
    settlementDate: '', currency: '', quantity: split.ratio,
    price: 0, tradeAmount: 0, totalFees: 0, changeAmount: 0,
  };
}

// ==================== Generator ====================

/** FIFO 核心计算：返回所有步骤和最终结果 */
export function computeFifoSteps(
  trades: TradeRow[],
  initialInventory: InitialInventory[] = [],
  splits: StockSplitRecord[] = [],
  targetCurrency: string = '人民币',
): { steps: FifoStep[]; result: FifoResult } {
  const queues = new Map<string, FifoLayer[]>();
  const allRealized: RealizedTrade[] = [];
  const allUnmatched: UnmatchedSell[] = [];
  const steps: FifoStep[] = [];

  seedInventory(queues, initialInventory);
  const events = buildEvents(trades, splits);
  let stepNum = 0;

  for (const event of events) {
    if (event.type === 'split') {
      processSplit(queues, event.data);
      stepNum++;
      steps.push({ step: stepNum, total: events.length, tradeRow: createSplitTradeRow(event.data), realized: [], unmatched: [] });
    } else {
      const trade = event.data;
      const layers = ensureQueue(queues, trade.stockCode);
      if (trade.direction.includes('买入') || trade.quantity > 0) {
        processBuy(layers, trade);
      } else if (trade.direction.includes('卖出') || trade.quantity < 0) {
        const result = processSell(layers, trade, trade.stockCode, targetCurrency);
        allRealized.push(...result.realized);
        allUnmatched.push(...result.unmatched);
        stepNum++;
        steps.push({ step: stepNum, total: events.length, tradeRow: trade, realized: result.realized, unmatched: result.unmatched });
      }
    }
  }

  return {
    steps,
    result: { realizedTrades: allRealized, unmatchedSells: allUnmatched },
  };
}

/** 便捷函数：只返回最终结果，不返回中间步骤 */
export function calculateFifo(
  trades: TradeRow[],
  initialInventory: InitialInventory[] = [],
  splits: StockSplitRecord[] = [],
  targetCurrency: string = '人民币',
): FifoResult {
  return computeFifoSteps(trades, initialInventory, splits, targetCurrency).result;
}

// ==================== Dividend calculation ====================

export function calculateDividends(
  dividends: DividendRecord[],
  targetCurrency: string = '人民币',
): DividendResult {
  // 按 股票+币种 分组
  const map = new Map<string, DividendSummary>();
  for (const div of dividends) {
    const currency = div.currency || '';
    const key = `${div.stockCode}||${currency}`;
    if (!map.has(key)) {
      map.set(key, {
        stockCode: div.stockCode, currency,
        income: 0, tax: 0, net: 0,
        incomeCount: 0, taxCount: 0,
        convertedIncome: 0, convertedTax: 0, convertedNet: 0,
      });
    }
    const s = map.get(key)!;
    if (div.amount > 0) {
      s.income += div.amount;
      s.incomeCount += 1;
      // 汇率换算
      const info = convertSync(div.date, currency, div.amount, targetCurrency);
      if (info && info.source !== 'same') {
        s.convertedIncome = (s.convertedIncome ?? 0) + info.convertedAmount;
        s.sourceCurrency = info.fromCurrency;
      } else if (info && info.source === 'same') {
        s.convertedIncome = (s.convertedIncome ?? 0) + info.convertedAmount;
      }
    } else {
      s.tax += div.amount;
      s.taxCount += 1;
      // 汇率换算（tax 为负数，取绝对值换算再恢复符号）
      const info = convertSync(div.date, currency, Math.abs(div.amount), targetCurrency);
      if (info && info.source !== 'same') {
        s.convertedTax = (s.convertedTax ?? 0) - info.convertedAmount;
        s.sourceCurrency = info.fromCurrency;
      } else if (info && info.source === 'same') {
        s.convertedTax = (s.convertedTax ?? 0) - info.convertedAmount;
      }
    }
    s.net = s.income + s.tax;
    if (s.convertedIncome !== undefined && s.convertedTax !== undefined) {
      s.convertedNet = s.convertedIncome + s.convertedTax;
    }
  }
  return { summaries: Array.from(map.values()), totalCount: dividends.length };
}

// ==================== Export wrapper ====================

import type { TaxCalculationResult } from './types';

export async function exportTaxResult(result: TaxCalculationResult): Promise<Uint8Array> {
  return exportToExcel(result.realizedTrades);
}

// ==================== Tax calculation service ====================

export function calculateTax(
  trades: TradeRow[],
  initialInventory: InitialInventory[] = [],
  dividends: DividendRecord[] = [],
  targetCurrency: string = '人民币',
): TaxCalculationResult {
  const fifoResult = calculateFifo(trades, initialInventory, [], targetCurrency);
  const realizedTrades = fifoResult.realizedTrades;

  const tradesByStock = new Map<string, RealizedTrade[]>();
  for (const t of realizedTrades) {
    if (!tradesByStock.has(t.stockCode)) tradesByStock.set(t.stockCode, []);
    tradesByStock.get(t.stockCode)!.push(t);
  }

  const grandTotal = realizedTrades.reduce((sum, t) => sum + t.realizedPnl, 0);
  const dividendResult = calculateDividends(dividends, targetCurrency);

  const totalRealizedPnl = grandTotal;
  const totalConvertedPnl = realizedTrades.reduce((s, t) => s + (t.convertedPnl || 0), 0);
  const pnlSummary = {
    totalRealizedPnl,
    totalConvertedPnl,
    totalDivIncome: dividendResult.summaries.reduce((s, d) => s + d.income, 0),
    totalDivTax: dividendResult.summaries.reduce((s, d) => s + d.tax, 0),
    totalDivConvertedIncome: dividendResult.summaries.reduce((s, d) => s + (d.convertedIncome ?? 0), 0),
    totalDivConvertedTax: dividendResult.summaries.reduce((s, d) => s + (d.convertedTax ?? 0), 0),
  };

  return { realizedTrades, tradesByStock, grandTotal, totalTrades: realizedTrades.length, unmatchedSells: fifoResult.unmatchedSells, dividendResult, pnlSummary };
}
