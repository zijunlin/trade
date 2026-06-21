# 项目架构文档

## 项目概览

**资本利得计算器** — 基于 FIFO（先进先出）算法的股票交易税务计算 Web 应用。

用户上传包含交易记录、持仓、股息的 Excel 文件，系统按 FIFO 规则逐笔配对买入/卖出，计算已实现盈亏，支持多币种汇率换算，并以动画形式展示计算过程。

**技术栈**: React 19 + TypeScript + Ant Design 5 + Vite + Vitest

---

## 目录结构

```
trade/
├── index.html                      # HTML 入口
├── package.json                    # 依赖与脚本
├── vite.config.ts                  # Vite 构建配置
├── vitest.config.ts                # Vitest 测试配置
├── tsconfig.json                   # TypeScript 根配置
├── tsconfig.app.json               # 应用 TS 配置
├── tsconfig.node.json              # Node 侧 TS 配置
│
├── data/
│   └── exchangeRates.json          # 本地汇率缓存（按日期存储）
│
├── scripts/
│   └── fetchRates.ts               # CLI 脚本：从 SAFE API 拉取汇率写入缓存
│
├── src/
│   ├── main.tsx                    # React 挂载入口
│   ├── index.css                   # 全局样式
│   ├── App.tsx                     # 根组件（页面布局、路由式条件渲染）
│   │
│   ├── lib/                        # 纯业务逻辑层（无 React 依赖）
│   │   ├── types.ts                # 所有 TypeScript 接口定义
│   │   ├── fifo.ts                 # FIFO 引擎 + 股息计算 + 税务汇总
│   │   ├── excelAdapter.ts         # Excel 解析（读取）+ 结果导出（写入）
│   │   └── exchangeRate.ts         # 汇率查询与货币换算
│   │
│   ├── hooks/
│   │   └── useTaxCalculation.ts    # React Hook，串联计算流程与 UI 状态
│   │
│   ├── components/
│   │   ├── CalculationAnimation.tsx # 计算过程动画与回放 UI
│   │   └── TaxResults.tsx          # 结果展示（统计卡片 + 表格 + Tabs）
│   │
│   └── __tests__/                  # 单元测试
│       ├── fifo.test.ts            # FIFO 配对逻辑
│       ├── dividend.test.ts        # 股息解析与聚合
│       └── excelParser.test.ts     # Excel 解析
```

---

## 模块职责

### 1. `src/lib/types.ts` — 类型定义层

**职责**: 定义整个应用的数据结构，所有模块共享这些类型。

| 接口 | 用途 |
|------|------|
| `TradeRow` | Excel 中单笔交易记录 |
| `InitialInventory` | 期初持仓（导入前已持有） |
| `DividendRecord` | 单笔股息/股息税记录 |
| `StockSplitRecord` | 拆股/合股记录 |
| `ParsedWorkbook` | Excel 解析后的完整数据容器 |
| `RealizedTrade` | FIFO 配对后的一笔已实现交易 |
| `UnmatchedSell` | 无法匹配买入的卖出记录 |
| `FifoLayer` (内部) | FIFO 队列中的一个买入批次 |
| `DividendSummary` | 单只股票单币种的股息汇总 |
| `FifoResult` | FIFO 计算最终结果 |
| `FifoStep` | 每一步的快照 |
| `TaxCalculationResult` | 税务计算最终输出 |
| `PnlSummary` | 盈亏汇总统计 |
| `ConversionInfo` | 每次货币换算的详细信息 |
| `ExtendedStep` | FifoStep 的扩展版（含持仓快照/累计盈亏） |
| `CalcState` | 完整 UI 状态（动画/暂停/回放/回顾） |

**设计原则**: 纯类型定义，不包含任何逻辑代码。

---

### 2. `src/lib/excelAdapter.ts` — Excel 适配层

**职责**: Excel 文件的读取与写入，是应用与外部数据格式之间的唯一边界。

#### 输入（解析）

| 函数 | 职责 |
|------|------|
| `parseExcelFile(file)` | 异步入口，通过 FileReader 读取文件后委托 `parseWorkbook` |
| `parseWorkbook(workbook)` | 从 4 个 Sheet 分别读取交易/持仓/股息/拆股数据 |
| `rawRowsToTrades(rawRows)` | 将原始行数组映射为 `TradeRow[]` |
| `parseInitialInventory(invRows)` | 从「证券-持仓总览」提取期初持仓 |
| `parseDividends(fundRows)` | 从「证券-资金进出」筛选「公司行动」行提取股息 |
| `parseSplits(assetRows)` | 从「证券-资产进出」识别拆股事件（配对比进出数量） |
| `parseDate(val)` | 通用日期解析（支持 Excel 日期码 / `YYYYMMDD` / 字符串） |
| `parseDateTime(val)` | 带时间的日期解析 |

#### 输出（导出）

| 函数 | 职责 |
|------|------|
| `exportToExcel(realizedTrades)` | 将已实现盈亏明细写入 `.xlsx` 文件并返回二进制数据 |

**设计原则**: 只负责格式转换，不包含计算逻辑。

---

### 3. `src/lib/exchangeRate.ts` — 汇率模块

**职责**: 提供汇率查询（缓存优先）和货币换算能力。

| 函数/常量 | 职责 |
|-----------|------|
| `normalizeCurrency(code)` | 将 ISO 代码映射为中文名称（USD→美元） |
| `convertSync(date, from, amount, to)` | 同步换算：给定日期的金额换算，返回 `ConversionInfo` |
| `lookupRateWithFallback(...)` | 内部查找：精确日期 → 向前查找最近可用日期 |
| `cache` | 内存缓存，启动时从 `data/exchangeRates.json` 初始化 |
| `CODE_MAP` | 货币代码 → 中文名称映射表 |

**设计原则**: 缓存优先、向前查找兜底、同币种免换算。无外部 API 调用（运行时只读缓存）。

---

### 4. `src/lib/fifo.ts` — FIFO 核心引擎

**职责**: 实现 FIFO 配对算法、股息聚合、税务汇总计算。是整个计算引擎的核心。

#### 内部工具函数

| 函数 | 职责 |
|------|------|
| `calcBuyCostPerShare(trade)` | 计算买入单价：`(成交金额 + 总费用) / 股数` |
| `calcSellPricePerShare(trade)` | 计算卖出净价：`(成交金额 - 总费用) / 股数` |
| `sortTrades(trades)` | 按股票代码 + 交易时间排序 |
| `groupSplitsByStock(splits)` | 按股票代码分组并排序拆股记录 |
| `buildEvents(trades, splits)` | 合并交易和拆股为有序事件流 |

#### FIFO 队列操作

| 函数 | 职责 |
|------|------|
| `seedInventory(queues, inventory)` | 将初始持仓注入 FIFO 队列 |
| `ensureQueue(queues, code)` | 确保某股票有对应的队列 |
| `processBuy(layers, trade)` | 买入 → 追加一层到 FIFO 队列 |
| `processSell(layers, trade, code, target)` | 卖出 → 逐层消费 FIFO，创建 `RealizedTrade`，调用 `convertSync` 换算 |
| `processSplit(queues, split)` | 拆股 → 调整所有层数量和单位成本 |

#### 对外 API

| 函数 | 职责 |
|------|------|
| `calculateFifo(...)` | 同步版：一次性跑完 generator 返回最终 `FifoResult` |
| `computeFifoSteps(...)` | 预计算所有步骤，返回 `{ steps: FifoStep[], result: FifoResult }`，供动画游标使用 |
| `calculateFifoGenerator(...)` | Generator 版：每步 yield `FifoStep`（保留向后兼容） |
| `calculateDividends(dividends, target)` | 按股票+币种分组聚合股息，调用 `convertSync` 换算 |
| `calculateTax(...)` | 一站式计算：FIFO + 股息 + 汇总 → `TaxCalculationResult` |
| `exportTaxResult(result)` | 将税务结果序列化为 Excel 二进制数据 |

**设计原则**: 纯函数、无副作用（除 `convertSync` 内部缓存查询）。Generator 模式支持前端动画暂停/回放。

---

### 5. `src/hooks/useTaxCalculation.ts` — 状态管理 Hook

**职责**: React Hook，串联整个计算流程，管理 UI 状态机。

#### 状态机流转

```
idle → loading → animating → (paused ↔ reviewing) → done
                           ↳ playbackPlaying (回放中)
```

| 状态属性 | 含义 |
|----------|------|
| `animating` | 是否正在播放计算动画 |
| `paused` | 是否暂停 |
| `reviewing` | 是否处于回顾模式（翻看历史步骤） |
| `playbackPlaying` | 是否正在自动播放回顾 |
| `loading` | 是否正在加载/解析文件 |

#### 核心 Handler

| Handler | 职责 |
|---------|------|
| `handleFile(file)` | 文件上传入口：解析 → 创建 generator → 逐步执行 → 产出结果 |
| `handleComplete()` | 一键完成：跳过动画直接跑完 generator |
| `handlePause()` / `handleResume()` | 暂停/继续动画 |
| `handlePrev()` / `handleNext()` | 回顾模式下前后翻看 |
| `handleReview()` / `handleExitReview()` | 进入/退出回顾模式 |
| `handlePlayback()` | 自动播放/暂停回顾 |
| `handleSpeed(speed)` | 调整动画速度 |
| `handleSetTargetCurrency(currency)` | 切换目标展示币种 |
| `handleExport()` | 触发 Excel 导出 |

#### 内部机制

- `ls` (ref): 可变状态容器，存储解析结果、generator、累计交易、累计盈亏、持仓快照、步骤历史
- `processStep()`: 处理每一步，更新累计状态，构建 `ExtendedStep`
- `buildFinalResult()`: generator 完成后组装最终 `TaxCalculationResult`
- `SPEED_MAP`: 动画速度档位 → 毫秒延迟

**设计原则**: 唯一拥有 React state 的模块，将纯计算委托给 `lib/` 层。

---

### 6. `src/components/CalculationAnimation.tsx` — 动画展示组件

**职责**: 展示计算过程的动画、进度、逐笔明细，支持暂停/回放/回顾 UI。

| 子组件/函数 | 职责 |
|-------------|------|
| `CalculationAnimation` (主组件) | 进度条 + 速度控制 + 当前交易信息卡 + 已实现交易表格 |
| `BuyInfo` | 买入时展示：开仓数量、当前仓位 |
| `SplitInfo` | 拆股时展示：原持仓、新增股数、拆股比例、拆股后仓位 |
| `SellFormula` | 卖出时展示：FIFO 成本匹配明细、汇率换算信息 |
| `pnlColor(val)` | 盈亏颜色：正数红色/负数绿色 |

**设计原则**: 纯展示组件，所有逻辑通过 props 传入。

---

### 7. `src/components/TaxResults.tsx` — 结果展示组件

**职责**: 展示最终计算结果：统计卡片、股息明细、盈亏明细分组表格。

| 展示区域 | 内容 |
|----------|------|
| Unmatched 警告 | 无法匹配的卖出记录（Alert + 表格） |
| 统计卡片 (×3) | 盈亏合计 / 股息收入合计 / 股息税合计（含换算值） |
| 股息明细表 | 按股票+币种分组：股息收入/股息税/净股息（原币 + 换算） |
| 盈亏明细 Tabs | 按股票代码分组 Tab，每 Tab 内为配对交易明细表 |

| 辅助函数 | 职责 |
|----------|------|
| `createDividendColumns(target)` | 生成股息表格列定义 |
| `createDetailColumns(target)` | 生成盈亏明细列定义（含汇率信息） |
| `UNMATCHED_COLUMNS` | 未匹配卖出表格列定义 |

**设计原则**: 纯展示组件。表格列定义与数据分离，支持多币种显示。

---

### 8. `src/App.tsx` — 根组件

**职责**: 页面整体布局、条件渲染切换、上传/导出交互。

| 功能区域 | 内容 |
|----------|------|
| 标题区 | 应用名称 |
| 计算说明 (Collapse) | FIFO 规则 / 初始仓位 / 股息处理 / 汇率说明 |
| 操作区 (Card) | 上传拖拽区 + 目标货币选择 + 导出按钮 |
| 回顾触发 (Card) | 计算完成后展示「查看计算过程」按钮 |
| 动画区 | `CalculationAnimation`（`animating || reviewing` 时渲染） |
| 结果区 | `TaxResults`（`result && !reviewing` 时渲染） |
| 加载区 | 解析中但未开始动画时的 loading 提示 |

| 辅助 Hook | 职责 |
|-----------|------|
| `useIsMobile()` | 响应式判断（窗口宽度 < 768px） |
| `ANIM_STYLES` | 内联 CSS 动画定义（fadeInUp / rowFlash） |

**设计原则**: 组合层，不包含业务逻辑。通过条件渲染控制 UI 状态切换。

---

### 9. `src/main.tsx` — 应用入口

**职责**: React DOM 挂载。引入全局样式，渲染 `<App />`。

---

### 10. `scripts/fetchRates.ts` — 汇率获取脚本

**职责**: CLI 工具，从国家外汇管理局 (SAFE) API 批量拉取汇率数据，写入 `data/exchangeRates.json`。

| 函数 | 职责 |
|------|------|
| `parseArgs()` | 解析命令行参数（一个或多个年份） |
| `datesInYear(year)` | 生成某年所有日期 |
| `fetchRatesForDate(date)` | 调用 SAFE API 获取单日汇率 |
| `saveData(data)` | 按日期降序写入 JSON 文件 |

**运行方式**: `npm run rates:fetch 2025` / `npm run rates:all`

---

## 数据流

```
用户上传 Excel
     │
     ▼
parseExcelFile() ──────────────────► ParsedWorkbook
     │                                  │
     │    ┌─ tradeRows ──────────────┐  │
     │    │                          │  │
     │    ▼                          ▼  ▼
     │  calculateFifoGenerator()   calculateDividends()
     │    │  (逐笔 yield FifoStep)    │  (按股票+币种聚合)
     │    │    │                      │
     │    │    ▼                      │
     │    │  processSell() ────► convertSync() 汇率换算
     │    │                          │
     ▼    ▼                          ▼
useTaxCalculation hook ──────► TaxCalculationResult
     │
     ▼
┌────────────────────┬────────────────────┐
│                    │                    │
CalculationAnimation  │  TaxResults        │  条件渲染
│  (动画/回放)        │  (统计卡片+表格)    │
└────────────────────┴────────────────────┘
```

---

## 模块依赖关系

```
App.tsx
├── useTaxCalculation.ts (hook)
│   ├── fifo.ts (parseExcelFile, calculateFifoGenerator, calculateDividends)
│   └── types.ts (ExtendedStep, CalcState)
│
├── CalculationAnimation.tsx (component)
│   └── types via props (FifoStep, RealizedTrade, etc.)
│
├── TaxResults.tsx (component)
│   └── types via props (TaxCalculationResult, etc.)
│
└── fifo.ts (exportTaxResult — dynamic import)

lib/fifo.ts
├── types.ts (所有类型)
├── exchangeRate.ts (convertSync)
└── excelAdapter.ts (exportToExcel)

lib/excelAdapter.ts
└── types.ts (TradeRow, InitialInventory, etc.)

lib/exchangeRate.ts
├── types.ts (ConversionInfo)
└── data/exchangeRates.json (import 初始化缓存)
```

---

## 设计原则总结

1. **单一职责**: 每个文件只负责一件事
   - `types.ts` → 只定义类型
   - `excelAdapter.ts` → 只负责格式转换
   - `exchangeRate.ts` → 只负责汇率/换算
   - `fifo.ts` → 只负责计算算法
   - `useTaxCalculation.ts` → 只负责状态管理
   - `CalculationAnimation.tsx` → 只负责动画展示
   - `TaxResults.tsx` → 只负责结果展示
   - `App.tsx` → 只负责页面组合

2. **纯函数优先**: `lib/` 下的所有函数均为纯函数，无副作用
3. **展示与逻辑分离**: components 层不包含业务逻辑，通过 props 接收数据
4. **状态集中管理**: 所有 React state 集中在 `useTaxCalculation` hook
5. **类型共享**: 所有模块通过 `types.ts` 共享类型定义
