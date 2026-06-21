# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

资本利得计算器 — 基于 FIFO（先进先出）算法的股票交易税务计算 Web 应用。用户上传包含交易记录、持仓、股息的 Excel 文件，系统计算已实现盈亏并支持汇率换算。

**技术栈**: React 19 + TypeScript + Ant Design 5 + Vite + Vitest

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Type-check + production build
npm test             # Run all tests (vitest watch mode)
npm test -- --run    # Run all tests once
npm test -- <file>   # Run a specific test file (e.g. src/__tests__/fifo.test.ts)
npm run lint         # Run ESLint
npm run preview      # Preview production build
npm run rates:fetch  # Fetch latest exchange rates (SAFE API)
npm run rates:2025   # Fetch 2025 rates
npm run rates:all    # Fetch 2024 + 2025 rates
```

## Architecture

> 详细的目录结构、模块职责、依赖关系和设计原则见 [docs/architecture.md](./docs/architecture.md)。

### Data Flow

```
Excel Upload → parseExcelFile() → ParsedWorkbook
                                    ↓
                    calculateFifoGenerator() (逐笔 FIFO)
                                    ↓
              processSell: convertSync() 填充 convertedPnl/exchangeRate
              calculateDividends(): convertSync() 填充股息换算
                                    ↓
                        TaxCalculationResult → TaxResults UI
```

### Key Modules

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | All TypeScript interfaces — `TradeRow`, `RealizedTrade`, `DividendRecord`, `DividendSummary`, `TaxCalculationResult`, `CalcState` |
| `src/lib/fifo.ts` | Core FIFO engine: `calculateFifo`, `calculateFifoGenerator`, `calculateTax`, `calculateDividends`. `processSell` 调用 `convertSync` 填充汇率换算字段 |
| `src/lib/excelAdapter.ts` | Excel 解析（xlsx）+ 结果导出。`parseDividends` 从「公司行动」行提取股息记录（含币种） |
| `src/lib/exchangeRate.ts` | 汇率模块。本地缓存（`data/exchangeRates.json`）+ SAFE API fallback。核心 API: `convertSync(date, fromCurrency, amount, toCurrency)` |
| `src/hooks/useTaxCalculation.ts` | React Hook，串联整个计算流程：文件解析 → 预取汇率 → FIFO 逐笔计算（带动画）→ 股息汇总 → 最终结果 |
| `src/components/CalculationAnimation.tsx` | 计算过程动画与回顾模式 UI |
| `src/components/TaxResults.tsx` | 结果展示：盈亏合计/股息收入合计/股息税合计统计卡片、股息明细表格、按股票分组的盈亏明细 Tabs |
| `src/App.tsx` | 主入口组件，上传/货币选择/动画/结果渲染 |

### FIFO Processing

`calculateFifoGenerator` 是 generator，逐笔 yield `FifoStep` 供前端动画展示。每步：
1. 如果是买入 → `processBuy` 添加到 FIFO 队列
2. 如果是卖出 → `processSell` 消费 FIFO 队列最旧层，创建 `RealizedTrade`（含 `convertedPnl`/`exchangeRate`/`sourceCurrency`）
3. 如果是拆股 → `processSplit` 调整所有层数量和成本价

### Dividend Module

`calculateDividends(dividends, targetCurrency)` 按**股票+币种**分组聚合，对每笔股息调用 `convertSync` 换算，产出 `DividendSummary[]`（含 `convertedIncome`/`convertedTax`/`convertedNet`）。

### State Machine

`useTaxCalculation` hook 管理完整 UI 状态 (`CalcState`)：`animating` → `paused` → `reviewing` → `playbackPlaying`。步骤历史存入 `stepHistory[]`，支持前后翻看。

## Test Structure

Tests in `src/__tests__/`:
- `fifo.test.ts` — FIFO 配对逻辑（买入/卖出匹配、初始库存、多股票独立、排序）
- `dividend.test.ts` — 股息解析与 `calculateDividends` 聚合/换算
- `excelParser.test.ts` — Excel 解析（日期、交易行、股息、持仓）
