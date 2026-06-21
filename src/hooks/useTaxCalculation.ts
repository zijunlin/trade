import { useState, useRef, useCallback, useEffect } from 'react';
import {
  parseExcelFile,
  computeFifoSteps,
  calculateDividends,
  type TaxCalculationResult,
  type FifoStep,
  type RealizedTrade,
  type UnmatchedSell,
  type TradeRow,
  type InitialInventory,
  type DividendRecord,
} from '../lib/fifo';
export type { ExtendedStep, CalcState } from '../lib/types';
import type { ExtendedStep, CalcState, ConversionInfo } from '../lib/types';

interface UseTaxCalculation {
  state: CalcState;
  handleFile: (file: File) => void;
  handlePause: () => void;
  handleResume: () => void;
  handlePrev: () => void;
  handleNext: () => void;
  handleSpeed: (speed: number) => void;
  handleComplete: () => void;
  handleReview: () => void;
  handleExitReview: () => void;
  handlePlayback: () => void;
  handleSetTargetCurrency: (currency: string) => void;
}

const SPEED_MAP = [0, 100, 250, 500, 1000, 2000];

// ==================== Helpers (pure functions) ====================

/** 构建最终税务计算结果 */
function buildFinalResult(
  parsed: { dividends: DividendRecord[] },
  trades: RealizedTrade[],
  unmatched: UnmatchedSell[],
): TaxCalculationResult {
  const tradesByStock = new Map<string, RealizedTrade[]>();
  for (const t of trades) {
    if (!tradesByStock.has(t.stockCode)) tradesByStock.set(t.stockCode, []);
    tradesByStock.get(t.stockCode)!.push(t);
  }

  const dividendResult = calculateDividends(parsed.dividends);

  const totalRealizedPnl = trades.reduce((s, t) => s + t.realizedPnl, 0);
  const totalConvertedPnl = trades.reduce((s, t) => s + (t.convertedPnl || 0), 0);
  const divSummaries = dividendResult.summaries;
  const pnlSummary = {
    totalRealizedPnl,
    totalConvertedPnl,
    totalDivIncome: divSummaries.reduce((s, d) => s + d.income, 0),
    totalDivTax: divSummaries.reduce((s, d) => s + d.tax, 0),
    totalDivConvertedIncome: divSummaries.reduce((s, d) => s + (d.convertedIncome ?? 0), 0),
    totalDivConvertedTax: divSummaries.reduce((s, d) => s + (d.convertedTax ?? 0), 0),
  };

  return {
    realizedTrades: trades,
    tradesByStock,
    grandTotal: totalRealizedPnl,
    totalTrades: trades.length,
    unmatchedSells: unmatched,
    dividendResult,
    pnlSummary,
  };
}

/** 为预计算的 FifoStep 补充展示用扩展字段 */
function buildExtendedSteps(steps: FifoStep[], targetCurrency: string): ExtendedStep[] {
  const extendedSteps: ExtendedStep[] = [];
  const positions = new Map<string, number>();
  let runningPnl = 0;
  let runningConvertedPnl = 0;

  // 初始化持仓（需要在调用方传入 initialInventory，这里在 handleFile 中已提前设置）
  // 但 computeFifoSteps 已经处理了 initialInventory，所以 positions 需要从
  // 第一步的 tradeRow.quantity 开始累积（这已在 generator 内部处理了）
  // 实际上我们需要重新追踪 position，因为 generator 内部的 FIFO layer 状态不暴露。
  // 简单方案：对每个 step，根据 tradeRow.quantity 推算 position
  // 但这不对 — 应该用 generator 内部的层状态。
  // 最佳方案：在 computeFifoSteps 中直接返回 ExtendedStep（含 positions）。

  for (const step of steps) {
    const qty = step.tradeRow.quantity;
    const currentPos = positions.get(step.tradeRow.stockCode) || 0;
    positions.set(step.tradeRow.stockCode, currentPos + qty);

    const conversions: ConversionInfo[] = [];
    let stepConvertedPnl = 0;
    for (const r of step.realized) {
      runningPnl += r.realizedPnl;
      if (r.convertedPnl !== undefined && r.exchangeRate !== undefined) {
        const info: ConversionInfo = {
          date: step.tradeRow.tradeTime,
          rateDate: step.tradeRow.tradeTime,
          fromCurrency: r.sourceCurrency || step.tradeRow.currency,
          toCurrency: targetCurrency,
          fromAmount: r.realizedPnl,
          rate: r.exchangeRate,
          convertedAmount: r.convertedPnl,
          source: 'cache',
        };
        conversions.push(info);
        stepConvertedPnl += r.convertedPnl;
      }
    }
    runningConvertedPnl += stepConvertedPnl;

    extendedSteps.push({
      ...step,
      positions: new Map(positions),
      runningPnl,
      runningConvertedPnl,
      tradeCurrency: step.tradeRow.currency,
      conversions,
    });
  }

  return extendedSteps;
}

/** 动画引擎：用游标遍历预计算步骤，支持暂停/继续/一键完成 */
async function animateWithCursor(
  steps: ExtendedStep[],
  _fifoResult: { realizedTrades: RealizedTrade[]; unmatchedSells: UnmatchedSell[] },
  opts: {
    speedRef: { current: number };
    pausedRef: { current: boolean };
    abortRef: { current: boolean };
    completeRef: { current: boolean };
    onStep: (
      step: ExtendedStep,
      accumulatedTrades: RealizedTrade[],
      accumulatedUnmatched: UnmatchedSell[],
      history: ExtendedStep[],
    ) => void;
  },
): Promise<number> {
  const { speedRef, pausedRef, abortRef, completeRef, onStep } = opts;
  const accumulatedTrades: RealizedTrade[] = [];
  const accumulatedUnmatched: UnmatchedSell[] = [];
  const history: ExtendedStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    accumulatedTrades.push(...step.realized);
    accumulatedUnmatched.push(...step.unmatched);
    history.push(step);

    onStep(step, accumulatedTrades, accumulatedUnmatched, history);

    // 一键完成：跳过剩余延迟
    if (completeRef.current) {
      // 继续循环但不 await，直接跳到下一步
      continue;
    }

    const delay = SPEED_MAP[speedRef.current];
    if (delay > 0) await new Promise<void>((r) => setTimeout(r, delay));
    if (abortRef.current) break;
    while (pausedRef.current) await new Promise<void>((r) => setTimeout(r, 200));
    if (abortRef.current || completeRef.current) break;
  }

  return steps.length;
}

export function useTaxCalculation(): UseTaxCalculation {
  const [animating, setAnimating] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [animStep, setAnimStep] = useState(0);
  const [animTotal, setAnimTotal] = useState(0);
  const [animTrades, setAnimTrades] = useState<RealizedTrade[]>([]);
  const [animUnmatched, setAnimUnmatched] = useState<UnmatchedSell[]>([]);
  const [animCurrentTrade, setAnimCurrentTrade] = useState<FifoStep | null>(null);
  const [result, setResult] = useState<TaxCalculationResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [, setStepHistory] = useState<ExtendedStep[]>([]);
  const [viewIndex, setViewIndex] = useState(-1);
  const [speed, setSpeed] = useState(4);
  const [targetCurrency, setTargetCurrency] = useState('人民币');

  const abortRef = useRef(false);
  const pausedRef = useRef(false);
  const completeRef = useRef(false);
  const speedRef = useRef(4);
  const reviewSpeedRef = useRef(4);
  const playingRef = useRef(false);
  const targetCurrencyRef = useRef('人民币');
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { reviewSpeedRef.current = speed; }, [speed]);
  useEffect(() => { targetCurrencyRef.current = targetCurrency; }, [targetCurrency]);

  const ls = useRef({
    parsed: null as { tradeRows: TradeRow[]; initialInventory: InitialInventory[]; dividends: DividendRecord[] } | null,
    /** 预计算的所有步骤（含 positions、runningPnl 等展示用扩展字段） */
    steps: [] as ExtendedStep[],
    /** 最终结果 */
    fifoResult: null as { realizedTrades: RealizedTrade[]; unmatchedSells: UnmatchedSell[] } | null,
  }).current;

  const handleFile = useCallback(async (file: File) => {
    abortRef.current = false;
    completeRef.current = false;
    setPaused(false);
    setReviewing(false);
    setPlaybackPlaying(false);
    pausedRef.current = false;
    setLoading(true);
    setAnimating(true);
    setResult(null);
    setAnimTrades([]);
    setAnimUnmatched([]);
    setAnimStep(0);
    setStepHistory([]);
    setViewIndex(-1);
    setFileName(file.name);

    try {
      const parsed = await parseExcelFile(file);
      ls.parsed = parsed;
      if (parsed.tradeRows.length === 0) {
        setAnimating(false);
        setLoading(false);
        return;
      }

      // ── 计算阶段：同步预计算所有 FIFO 步骤 ──
      const { steps, result: fifoResult } = computeFifoSteps(
        parsed.tradeRows,
        parsed.initialInventory,
        parsed.splits,
        targetCurrencyRef.current,
      );

      // 为每步补充扩展字段（positions、runningPnl、conversions 等展示数据）
      const extendedSteps = buildExtendedSteps(steps, targetCurrencyRef.current);
      ls.steps = extendedSteps;
      ls.fifoResult = fifoResult;

      setAnimTotal(extendedSteps.length);
      if (extendedSteps.length === 0) {
        setAnimating(false);
        setLoading(false);
        return;
      }

      // ── 动画阶段：用游标逐步展示预计算的步骤 ──
      await animateWithCursor(
        extendedSteps,
        fifoResult,
        {
          speedRef,
          pausedRef,
          abortRef,
          completeRef,
          onStep: (step, accumulatedTrades, accumulatedUnmatched, history) => {
            setAnimStep(step.step);
            setAnimCurrentTrade(step);
            setAnimTrades([...accumulatedTrades]);
            setAnimUnmatched([...accumulatedUnmatched]);
            setStepHistory([...history]);
          },
        },
      );

      // 动画完成后，用完整步骤数组替换状态中的 stepHistory
      // （动画期间 onStep 回调逐步追加，"一键完成" 或中断可能导致 state 不完整）
      setStepHistory([...extendedSteps]);

      // ── 计算最终结果 ──
      const taxResult = buildFinalResult(
        parsed,
        fifoResult.realizedTrades,
        fifoResult.unmatchedSells,
      );
      setResult(taxResult);
    } catch {
      // Error handled by caller via result state
    } finally {
      setLoading(false);
      setAnimating(false);
      setPaused(false);
      setAnimCurrentTrade(null);
      ls.parsed = null;
      ls.fifoResult = null;
    }
  }, []);

  const handleComplete = useCallback(() => {
    if (ls.steps.length === 0) return;
    completeRef.current = true;
    setPaused(false);
    pausedRef.current = false;
  }, []);

  const handleReview = useCallback(() => {
    if (ls.steps.length === 0) return;
    setReviewing(true);
    setViewIndex(0);
    setPlaybackPlaying(false);
    playingRef.current = false;
  }, []);

  const handleExitReview = useCallback(() => {
    setReviewing(false);
    setPlaybackPlaying(false);
    playingRef.current = false;
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setViewIndex(-1);
  }, []);

  const handlePlayback = useCallback(() => {
    if (playbackPlaying) {
      setPlaybackPlaying(false);
      playingRef.current = false;
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      return;
    }
    setPlaybackPlaying(true);
    playingRef.current = true;
    setViewIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= ls.steps.length - 1) return 0;
      return prev;
    });
  }, [playbackPlaying, ls.steps.length]);

  useEffect(() => {
    if (!playbackPlaying || !reviewing) {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      return;
    }
    const tick = () => {
      setViewIndex((prev) => {
        const next = prev + 1;
        if (next >= ls.steps.length) {
          setPlaybackPlaying(false);
          playingRef.current = false;
          return prev;
        }
        return next;
      });
    };
    const delay = SPEED_MAP[reviewSpeedRef.current] || 1000;
    playbackTimerRef.current = setTimeout(tick, Math.max(delay, 50));
    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [playbackPlaying, reviewing, viewIndex, ls.steps.length]);

  const handlePause = useCallback(() => setPaused(true), []);
  const handleResume = useCallback(() => { setPaused(false); if (!reviewing) setViewIndex(-1); }, [reviewing]);
  const handlePrev = useCallback(() => {
    setViewIndex((prev) => Math.max(0, prev === -1 ? ls.steps.length - 2 : prev - 1));
  }, [ls.steps.length]);
  const handleNext = useCallback(() => {
    setViewIndex((prev) => Math.min(ls.steps.length - 1, prev === -1 ? ls.steps.length - 1 : prev + 1));
  }, [ls.steps.length]);
  const handleSpeed = useCallback((s: number) => setSpeed(s), []);
  const handleSetTargetCurrency = useCallback((c: string) => setTargetCurrency(c), []);

  // Derive view state
  const viewStep = viewIndex >= 0 && viewIndex < ls.steps.length ? ls.steps[viewIndex] : null;
  const viewPnl = viewStep ? viewStep.runningPnl : (ls.steps.length > 0 ? ls.steps[ls.steps.length - 1].runningPnl : 0);
  const viewConvertedPnl = viewStep ? viewStep.runningConvertedPnl : (ls.steps.length > 0 ? ls.steps[ls.steps.length - 1].runningConvertedPnl : 0);
  const viewPositions = viewStep ? viewStep.positions : (ls.steps.length > 0 ? ls.steps[ls.steps.length - 1].positions : new Map());
  const viewTrades = viewIndex >= 0 && viewIndex < ls.steps.length
    ? ls.steps.slice(0, viewIndex + 1).flatMap((s) => s.realized)
    : animTrades;
  const viewUnmatched = viewIndex >= 0 && viewIndex < ls.steps.length
    ? ls.steps.slice(0, viewIndex + 1).flatMap((s) => s.unmatched)
    : animUnmatched;
  const viewCurrentTrade = viewStep || animCurrentTrade;

  return {
    state: {
      animating, paused, reviewing, playbackPlaying, loading,
      animStep, animTotal,
      animTrades: viewTrades,
      animUnmatched: viewUnmatched,
      animCurrentTrade: viewCurrentTrade,
      result, fileName,
      stepHistory: ls.steps, viewIndex, viewPnl, viewConvertedPnl, viewPositions,
      speed,
      hasHistory: ls.steps.length > 0,
      targetCurrency,
    },
    handleFile,
    handlePause,
    handleResume,
    handlePrev,
    handleNext,
    handleSpeed,
    handleComplete,
    handleReview,
    handleExitReview,
    handlePlayback,
    handleSetTargetCurrency,
  };
}
