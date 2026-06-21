import type { RealizedTrade } from './types';

/** Export realized trades to Excel workbook bytes (lazy-loads xlsx) */
export async function exportToExcel(realizedTrades: RealizedTrade[]): Promise<Uint8Array> {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  const detailRows = realizedTrades.map((t) => ({
    '股票': t.stockCode,
    '买入来源': t.buyTime,
    '卖出时间': t.sellTime,
    '数量': t.quantity,
    '成本价': Math.round(t.costPerShare * 10000) / 10000,
    '卖出价': Math.round(t.sellPrice * 10000) / 10000,
    '已实现盈亏': Math.round(t.realizedPnl * 100) / 100,
    '仓位': t.positionBefore != null ? Math.round(t.positionBefore * 100) / 100 : null,
  }));
  const detailWs = XLSX.utils.json_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(wb, detailWs, '已实现盈亏明细');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
