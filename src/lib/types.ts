// ==================== Excel Parser Types ====================

/** 股息记录 — 从 Excel 解析出的每笔股息/股息税 */
export interface DividendRecord {
  /** 股票代码（如 `AAPL`） */
  stockCode: string;
  /** 股息发放日期 */
  date: string;
  /** 金额，正数表示股息收入，负数表示股息税 */
  amount: number;
  /** 币种（如 `USD`、`JPY`），可选 */
  currency?: string;
}

/** 拆股/合股记录 */
export interface StockSplitRecord {
  /** 股票代码 */
  stockCode: string;
  /** 拆股生效日期 */
  date: string;
  /** 拆股比例，例如 `2` 表示 1 股拆为 2 股 */
  ratio: number;
}

/** 解析后的完整 Excel 工作簿 — 包含所有从文件中提取的数据 */
export interface ParsedWorkbook {
  /** 所有交易明细行 */
  tradeRows: TradeRow[];
  /** 初始持仓（导入前已持有的股票） */
  initialInventory: InitialInventory[];
  /** 所有股息记录 */
  dividends: DividendRecord[];
  /** 所有拆股记录 */
  splits: StockSplitRecord[];
}

// ==================== FIFO Types ====================

/** 单笔交易记录 — 对应 Excel 中的每一行交易 */
export interface TradeRow {
  /** 交易时间 */
  tradeTime: string;
  /** 股票代码 */
  stockCode: string;
  /** 交易方向（`buy` 买入 / `sell` 卖出） */
  direction: string;
  /** 交割日期 */
  settlementDate: string;
  /** 交易币种 */
  currency: string;
  /** 交易股数 */
  quantity: number;
  /** 每股成交价 */
  price: number;
  /** 交易金额（quantity × price） */
  tradeAmount: number;
  /** 总手续费 */
  totalFees: number;
  /** 资金变动额（实际入账/扣款金额） */
  changeAmount: number;
}

/** 已实现盈亏的配对交易 — FIFO 规则下买入与卖出的匹配结果 */
export interface RealizedTrade {
  /** 股票代码 */
  stockCode: string;
  /** 对应买入时间（FIFO 匹配的买入批次） */
  buyTime: string;
  /** 卖出时间 */
  sellTime: string;
  /** 配对成交股数 */
  quantity: number;
  /** 买入批次的每股成本 */
  costPerShare: number;
  /** 卖出价格 */
  sellPrice: number;
  /** 已实现盈亏（本地币种） */
  realizedPnl: number;
  /** 换算为目标币种后的盈亏，可选 */
  convertedPnl?: number;
  /** 使用的汇率，可选 */
  exchangeRate?: number;
  /** 原始交易币种，可选 */
  sourceCurrency?: string;
  /** 卖出前的持仓数量，可选 */
  positionBefore?: number;
}

/** 初始持仓 — 用户导入交易记录前已持有的股票 */
export interface InitialInventory {
  /** 股票代码 */
  stockCode: string;
  /** 持仓股数 */
  quantity: number;
  /** 每股成本价 */
  costPerShare: number;
}

/** 无法匹配的卖出记录 — 在 FIFO 规则下找不到对应买入批次的卖出 */
export interface UnmatchedSell {
  /** 股票代码 */
  stockCode: string;
  /** 卖出时间 */
  sellTime: string;
  /** 卖出股数 */
  quantity: number;
  /** 卖出价格 */
  sellPrice: number;
}

// ==================== Dividend Types ====================

/** 单只股票单币种的股息汇总 */
export interface DividendSummary {
  /** 股票代码 */
  stockCode: string;
  /** 币种 */
  currency: string;
  /** 股息收入合计（amount > 0 的累加） */
  income: number;
  /** 股息税合计（amount < 0 的累加，为负数） */
  tax: number;
  /** 净股息（income + tax） */
  net: number;
  /** 股息收入笔数 */
  incomeCount: number;
  /** 股息税笔数 */
  taxCount: number;
  /** 股息收入换算为目标币种后的金额 */
  convertedIncome?: number;
  /** 股息税换算为目标币种后的金额 */
  convertedTax?: number;
  /** 净股息换算为目标币种后的金额（convertedIncome + convertedTax） */
  convertedNet?: number;
  /** 汇率来源币种 */
  sourceCurrency?: string;
}

/** 股息计算结果 */
export interface DividendResult {
  /** 按股票+币种分组的股息汇总 */
  summaries: DividendSummary[];
  /** 股息记录总数 */
  totalCount: number;
}

/** FIFO 计算结果 — 配对完成后的全部实现交易和未匹配卖出 */
export interface FifoResult {
  /** 所有已配对的实现交易 */
  realizedTrades: RealizedTrade[];
  /** 无法匹配的卖出记录 */
  unmatchedSells: UnmatchedSell[];
}

/** FIFO 单步执行快照 — 逐笔处理交易时的中间状态 */
export interface FifoStep {
  /** 当前步骤编号 */
  step: number;
  /** 总步骤数 */
  total: number;
  /** 当前处理的交易行 */
  tradeRow: TradeRow;
  /** 本步产生的已实现交易 */
  realized: RealizedTrade[];
  /** 本步产生的未匹配卖出 */
  unmatched: UnmatchedSell[];
}

// ==================== Tax Calculation Types ====================

/** 盈亏汇总 — 用于展示统计卡片 */
export interface PnlSummary {
  /** 已实现盈亏合计 */
  totalRealizedPnl: number;
  /** 已实现盈亏换算后合计 */
  totalConvertedPnl: number;
  /** 股息收入合计 */
  totalDivIncome: number;
  /** 股息税合计 */
  totalDivTax: number;
  /** 股息收入换算后合计 */
  totalDivConvertedIncome: number;
  /** 股息税换算后合计 */
  totalDivConvertedTax: number;
}

/** 税务计算最终结果 — 完整的盈亏计算输出 */
export interface TaxCalculationResult {
  /** 所有已实现交易 */
  realizedTrades: RealizedTrade[];
  /** 按股票代码分组的交易明细 */
  tradesByStock: Map<string, RealizedTrade[]>;
  /** 所有股票的总盈亏合计 */
  grandTotal: number;
  /** 交易配对总数 */
  totalTrades: number;
  /** 全部未匹配卖出 */
  unmatchedSells: UnmatchedSell[];
  /** 股息汇总结果 */
  dividendResult: DividendResult;
  /** 盈亏汇总（用于展示统计卡片） */
  pnlSummary: PnlSummary;
}

// ==================== Exchange Rate Types ====================

/** 汇率换算信息 — 记录每次货币换算的细节 */
export interface ConversionInfo {
  /** 交易日期 */
  date: string;
  /** 实际使用的汇率日期 */
  rateDate: string;
  /** 源币种 */
  fromCurrency: string;
  /** 目标币种 */
  toCurrency: string;
  /** 换算前金额 */
  fromAmount: number;
  /** 使用的汇率 */
  rate: number;
  /** 换算后金额 */
  convertedAmount: number;
  /**
   * 汇率来源：
   * `cache` = 本地缓存, `api` = 实时接口, `fallback` = 备用汇率, `same` = 同币种无需换算
   */
  source: 'cache' | 'api' | 'fallback' | 'same';
}

// ==================== Hook Types ====================

/** 扩展的步骤 — 继承 FifoStep，增加前端动画展示所需的额外状态 */
export interface ExtendedStep extends FifoStep {
  /** 当前所有股票的持仓数量快照 */
  positions: Map<string, number>;
  /** 截至本步的累计盈亏 */
  runningPnl: number;
  /** 截至本步的累计盈亏（已换算为目标币种） */
  runningConvertedPnl: number;
  /** 当前交易的币种 */
  tradeCurrency: string;
  /** 本步涉及的汇率换算记录 */
  conversions: ConversionInfo[];
}

/** 计算器的完整 UI 状态 — 控制动画播放、历史记录翻看等 */
export interface CalcState {
  /** 是否正在播放动画 */
  animating: boolean;
  /** 是否暂停 */
  paused: boolean;
  /** 是否处于回顾模式 */
  reviewing: boolean;
  /** 是否正在回放 */
  playbackPlaying: boolean;
  /** 是否正在加载文件 */
  loading: boolean;
  /** 动画当前步数 */
  animStep: number;
  /** 动画总步数 */
  animTotal: number;
  /** 动画已展示的交易 */
  animTrades: RealizedTrade[];
  /** 动画已展示的未匹配卖出 */
  animUnmatched: UnmatchedSell[];
  /** 当前正在展示的步骤详情 */
  animCurrentTrade: FifoStep | null;
  /** 最终计算结果 */
  result: TaxCalculationResult | null;
  /** 当前处理的文件名 */
  fileName: string;
  /** 完整的步骤历史（用于前后翻看） */
  stepHistory: ExtendedStep[];
  /** 当前查看的步骤索引 */
  viewIndex: number;
  /** 当前步骤的累计盈亏 */
  viewPnl: number;
  /** 当前步骤的换算后累计盈亏 */
  viewConvertedPnl: number;
  /** 当前步骤的持仓快照 */
  viewPositions: Map<string, number>;
  /** 动画播放速度 */
  speed: number;
  /** 是否有可翻看的历史步骤 */
  hasHistory: boolean;
  /** 目标展示币种 */
  targetCurrency: string;
}
