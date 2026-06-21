import { Card, Progress, Table, Space, Typography, Tag, Button, Slider } from 'antd';
import {
  PauseCircleOutlined, PlayCircleOutlined, StepBackwardOutlined, StepForwardOutlined,
  ThunderboltOutlined, FastForwardOutlined, ArrowLeftOutlined, SwapOutlined,
} from '@ant-design/icons';
import type { FifoStep, RealizedTrade, UnmatchedSell } from '../lib/fifo';
import type { ConversionInfo } from '../lib/exchangeRate';
import type { ExtendedStep } from '../hooks/useTaxCalculation';

const { Text } = Typography;

const SPEED_LABELS = ['极速', '快', '中', '慢', '默认', '极慢'];

const ANIM_COLUMNS = [
  { title: '股票', dataIndex: 'stockCode' as const, key: 'stockCode', width: 90 },
  { title: '买入来源', dataIndex: 'buyTime' as const, key: 'buyTime', width: 100 },
  { title: '卖出时间', dataIndex: 'sellTime' as const, key: 'sellTime', width: 100 },
  { title: '数量', dataIndex: 'quantity' as const, key: 'quantity', width: 70, align: 'right' as const },
  {
    title: '成本价', dataIndex: 'costPerShare' as const, key: 'costPerShare', width: 90, align: 'right' as const,
    render: (val: number) => val.toFixed(4),
  },
  {
    title: '卖出价', dataIndex: 'sellPrice' as const, key: 'sellPrice', width: 90, align: 'right' as const,
    render: (val: number) => val.toFixed(4),
  },
  {
    title: '盈亏', dataIndex: 'realizedPnl' as const, key: 'realizedPnl', width: 100, align: 'right' as const,
    render: (val: number) => (
      <span style={{ color: val >= 0 ? '#cf1322' : '#389e0d', fontWeight: 600 }}>{val.toFixed(2)}</span>
    ),
  },
];

function pnlColor(val: number) {
  return val >= 0 ? '#cf1322' : '#389e0d';
}

interface Props {
  animStep: number;
  animTotal: number;
  animTrades: RealizedTrade[];
  animUnmatched: UnmatchedSell[];
  animCurrentTrade: FifoStep | null;
  isMobile: boolean;
  paused: boolean;
  speed: number;
  stepHistory: ExtendedStep[];
  targetCurrency: string;
  viewIndex: number;
  viewPnl: number;
  viewConvertedPnl: number;
  viewPositions: Map<string, number>;
  onPause: () => void;
  onResume: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSpeed: (speed: number) => void;
  onComplete: () => void;
  reviewing: boolean;
  playbackPlaying: boolean;
  onReview: () => void;
  onExitReview: () => void;
  onPlayback: () => void;
}

export function CalculationAnimation({
  animStep, animTotal, animTrades, animCurrentTrade, isMobile,
  paused, speed, stepHistory, targetCurrency,
  viewIndex, viewPnl, viewConvertedPnl, viewPositions,
  onPause, onResume, onPrev, onNext, onSpeed, onComplete,
  reviewing, playbackPlaying, onExitReview, onPlayback,
}: Props) {
  const percent = animTotal > 0 ? Math.round((animStep / animTotal) * 100) : 0;
  const isViewingPast = viewIndex >= 0;
  const canPrev = reviewing ? viewIndex > 0 : viewIndex === -1 ? stepHistory.length >= 2 : viewIndex > 0;
  const canNext = reviewing ? viewIndex < stepHistory.length - 1 : viewIndex === -1 ? stepHistory.length >= 1 : viewIndex < stepHistory.length - 1;

  // Get conversions for current step
  const currentConversions = (viewIndex >= 0 && viewIndex < stepHistory.length)
    ? stepHistory[viewIndex].conversions
    : (animCurrentTrade ? (stepHistory[animStep - 1]?.conversions || []) : []);

  const titleText = reviewing ? '计算过程回放' : (paused ? (isViewingPast ? '回顾计算' : '已暂停') : '正在计算');

  return (
    <Card
      title={
        <Space size={isMobile ? 6 : undefined} wrap>
          <span style={{ fontSize: isMobile ? 14 : 16 }}>{titleText}</span>
          {animCurrentTrade && (
            <Text style={{ fontSize: isMobile ? 13 : 14, color: '#1677ff', fontWeight: 600 }}>
              {animCurrentTrade.tradeRow.stockCode}
            </Text>
          )}
          <Text type="secondary" style={{ fontSize: isMobile ? 12 : 13 }}>
            {reviewing ? `${viewIndex + 1} / ${stepHistory.length}` : `${animStep} / ${animTotal}`}
          </Text>
        </Space>
      }
      extra={
        <Space size={isMobile ? 4 : 8} wrap>
          {animCurrentTrade && !reviewing && (
            <Tag color="processing" style={{ fontSize: isMobile ? 11 : undefined }}>
              {isMobile
                ? animCurrentTrade.tradeRow.direction.replace('卖出', '卖').replace('买入', '买')
                : animCurrentTrade.tradeRow.direction}
            </Tag>
          )}
          {reviewing && (
            <Tag color={playbackPlaying ? 'success' : 'default'} style={{ fontSize: isMobile ? 11 : undefined }}>
              {playbackPlaying ? '播放中' : `第 ${viewIndex + 1} 步`}
            </Tag>
          )}
          {!reviewing && !paused && (
            <>
              <Button size="small" icon={<PauseCircleOutlined />} onClick={onPause}>暂停</Button>
              <Button size="small" type="primary" danger icon={<ThunderboltOutlined />} onClick={onComplete}>一键完成</Button>
            </>
          )}
          {!reviewing && paused && (
            <>
              <Button size="small" icon={<StepBackwardOutlined />} disabled={!canPrev} onClick={onPrev}>上一步</Button>
              <Button size="small" icon={<StepForwardOutlined />} disabled={!canNext} onClick={onNext}>下一步</Button>
              <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={onResume}>继续</Button>
              <Button size="small" danger icon={<ThunderboltOutlined />} onClick={onComplete}>一键完成</Button>
            </>
          )}
          {reviewing && (
            <>
              <Button size="small" icon={<ArrowLeftOutlined />} onClick={onExitReview}>
                {isMobile ? '返回' : '返回结果'}
              </Button>
              <Button size="small" icon={<StepBackwardOutlined />} disabled={!canPrev} onClick={onPrev}>上一步</Button>
              <Button size="small" type={playbackPlaying ? 'primary' : 'default'} icon={playbackPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />} onClick={onPlayback}>
                {playbackPlaying ? '暂停' : '播放'}
              </Button>
              <Button size="small" icon={<StepForwardOutlined />} disabled={!canNext} onClick={onNext}>下一步</Button>
            </>
          )}
        </Space>
      }
      style={{ marginBottom: isMobile ? 12 : 24 }}
      styles={{ body: { padding: isMobile ? 12 : 24 } }}
    >
      <Space direction="vertical" size={isMobile ? 8 : 'middle'} style={{ width: '100%' }}>
        {/* Progress bar */}
        <Progress
          percent={reviewing ? Math.round(((viewIndex + 1) / stepHistory.length) * 100) : percent}
          strokeColor={reviewing ? (playbackPlaying ? '#52c41a' : '#722ed1') : percent === 100 ? '#52c41a' : paused ? '#faad14' : '#1677ff'}
          size="small"
        />

        {/* Speed control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FastForwardOutlined style={{ color: '#999', fontSize: 12 }} />
          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>速度：</Text>
          <Slider
            value={speed}
            onChange={onSpeed}
            min={0}
            max={SPEED_LABELS.length - 1}
            marks={Object.fromEntries(SPEED_LABELS.map((label, i) => [i, isMobile ? label[0] : label]))}
            tooltip={{ formatter: (v) => SPEED_LABELS[v || 0] }}
            style={{ flex: 1 }}
            trackStyle={{ backgroundColor: reviewing ? '#722ed1' : '#1677ff' }}
            railStyle={{ backgroundColor: '#d9d9d9' }}
          />
        </div>

        {/* Current trade info */}
        {animCurrentTrade && (
          <Card size="small" style={{ background: '#fafafa', borderColor: reviewing ? '#d3adf7' : '#d9d9d9', padding: isMobile ? 8 : 12 }}>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <div>
                <Text strong style={{ fontSize: isMobile ? 13 : 14 }}>{animCurrentTrade.tradeRow.stockCode}</Text>
                <Text type="secondary" style={{ marginLeft: 8, fontSize: isMobile ? 11 : 12 }}>
                  {animCurrentTrade.tradeRow.direction} · {animCurrentTrade.tradeRow.tradeTime}
                </Text>
              </div>
              <BuyInfo step={animCurrentTrade} positions={viewPositions} isMobile={isMobile} />
              <SplitInfo step={animCurrentTrade} positions={viewPositions} isMobile={isMobile} />
              <SellFormula step={animCurrentTrade} conversions={currentConversions} isMobile={isMobile} />

              {/* Running totals */}
              <div style={{ fontSize: isMobile ? 12 : 13, borderTop: '1px solid #eee', paddingTop: 4, marginTop: 4 }}>
                <Space direction={isMobile ? 'vertical' : 'horizontal'} size={isMobile ? 2 : 'large'}>
                  <span>
                    <Text type="secondary">累计盈亏：</Text>
                    <Text strong style={{ color: pnlColor(viewPnl), fontSize: isMobile ? 14 : 15 }}>
                      {viewPnl.toFixed(2)}
                    </Text>
                  </span>
                  {viewConvertedPnl !== 0 && (
                    <span>
                      <SwapOutlined style={{ fontSize: 11, color: '#999', marginRight: 4 }} />
                      <Text type="secondary">换算 {targetCurrency}：</Text>
                      <Text strong style={{ color: pnlColor(viewConvertedPnl), fontSize: isMobile ? 14 : 15 }}>
                        {viewConvertedPnl.toFixed(2)}
                      </Text>
                    </span>
                  )}
                </Space>
              </div>
            </Space>
          </Card>
        )}

        {/* Trades table */}
        {animTrades.length > 0 && (
          <div style={{ maxHeight: isMobile ? 240 : 360, overflow: 'auto' }}>
            <Table
              columns={ANIM_COLUMNS}
              dataSource={animTrades.slice(-20)}
              rowKey={(_, i) => `anim-${reviewing ? viewIndex : animStep}-${i}`}
              pagination={false}
              size="small"
              showHeader={!isMobile}
              rowClassName={(_, i) => {
                const dataLen = Math.min(animTrades.length, 20);
                return i === dataLen - 1 ? 'flash-row' : '';
              }}
              style={{ animation: 'fadeInUp 0.2s ease-out' }}
            />
          </div>
        )}

        {animTrades.length === 0 && (
          <div style={{ textAlign: 'center', padding: isMobile ? 12 : 20, color: '#bbb', fontSize: isMobile ? 12 : 13 }}>
            {reviewing ? '暂无盈亏记录' : '正在初始化 FIFO 队列...'}
          </div>
        )}
      </Space>
    </Card>
  );
}

function BuyInfo({ step, positions, isMobile }: { step: FifoStep; positions: Map<string, number>; isMobile: boolean }) {
  const row = step.tradeRow;
  const isBuy = row.direction.includes('买入') || row.quantity > 0;
  if (!isBuy) return null;
  const buyQty = Math.abs(row.quantity);
  const currentPos = positions.get(row.stockCode) || 0;
  return (
    <div style={{ fontSize: isMobile ? 12 : 13, borderTop: '1px dashed #e8e8e8', paddingTop: 6, marginTop: 2 }}>
      <Text type="secondary">买入开仓：</Text>
      <Text strong style={{ color: '#1677ff' }}>{buyQty}</Text>
      <Text type="secondary"> 股 → 当前仓位 </Text>
      <Text strong style={{ color: '#1677ff' }}>{currentPos}</Text>
      <Text type="secondary"> 股</Text>
    </div>
  );
}

function SplitInfo({ step, positions, isMobile }: { step: FifoStep; positions: Map<string, number>; isMobile: boolean }) {
  const row = step.tradeRow;
  if (!row.direction.startsWith('拆股')) return null;

  const currentPos = positions.get(row.stockCode) || 0;
  const additionalQty = row.quantity;
  const oldQty = currentPos - additionalQty;
  const ratio = oldQty > 0 ? (oldQty + additionalQty) / oldQty : 0;

  return (
    <div style={{ fontSize: isMobile ? 12 : 13, borderTop: '1px dashed #fa8c16', paddingTop: 6, marginTop: 2 }}>
      <div style={{ color: '#d46b08', fontWeight: 600 }}>
        <SwapOutlined /> 拆股调整
      </div>
      <div>
        <Text type="secondary">原持仓：</Text>
        <Text strong>{oldQty.toFixed(2)}</Text>
        <Text type="secondary"> 股</Text>
      </div>
      <div>
        <Text type="secondary">新增：</Text>
        <Text strong style={{ color: '#d46b08' }}>+{additionalQty}</Text>
        <Text type="secondary"> 股</Text>
      </div>
      {ratio > 0 && (
        <div>
          <Text type="secondary">拆股比例：</Text>
          <Text strong>1:{ratio.toFixed(2)}</Text>
        </div>
      )}
      <div>
        <Text type="secondary">拆股后仓位：</Text>
        <Text strong style={{ color: '#1677ff' }}>{currentPos.toFixed(2)}</Text>
        <Text type="secondary"> 股</Text>
      </div>
    </div>
  );
}

function SellFormula({ step, conversions, isMobile }: { step: FifoStep; conversions: ConversionInfo[]; isMobile: boolean }) {
  if (step.realized.length === 0) return null;
  const row = step.tradeRow;
  const sellQty = Math.abs(row.quantity);
  const sellPrice = step.realized[0].sellPrice;
  const needsConversion = conversions.length > 0;

  return (
    <>
      <div style={{ fontSize: isMobile ? 12 : 13, borderTop: '1px dashed #e8e8e8', paddingTop: 6, marginTop: 2 }}>
        <Text type="secondary">卖出数量：</Text><Text strong>{sellQty}</Text><Text type="secondary"> 股</Text>
      </div>
      <div style={{ fontSize: isMobile ? 12 : 13, wordBreak: 'break-all' }}>
        <Text type="secondary">卖出单价：</Text>
        <Text strong>{sellPrice.toFixed(4)}</Text>
      </div>
      {/* Currency conversion info */}
      {needsConversion && (
        <div style={{ fontSize: isMobile ? 12 : 13, borderTop: '1px dashed #e8e8e8', paddingTop: 6, marginTop: 4 }}>
          <Text type="secondary">汇率换算：</Text>
          {conversions.map((c, i) => (
            <div key={i} style={{ marginTop: 2 }}>
              <Tag color="blue" style={{ fontSize: 11, marginRight: 4 }}>
                {c.fromCurrency} → {c.toCurrency}
              </Tag>
              <Text type="secondary" style={{ fontSize: 'inherit' }}>
                汇率 {c.rate.toFixed(4)} | 原始 {c.fromAmount.toFixed(2)} → 换算 {c.convertedAmount.toFixed(2)}
              </Text>
              {c.rateDate !== c.date && (
                <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
                  （汇率日期 {c.rateDate}）
                </Text>
              )}
            </div>
          ))}
        </div>
      )}
      {/* FIFO cost matching */}
      <div style={{ fontSize: isMobile ? 12 : 13, borderTop: '1px dashed #e8e8e8', paddingTop: 6, marginTop: 4 }}>
        <Text type="secondary">FIFO 成本匹配：</Text>
      </div>
      {step.realized.map((r, i) => (
        <div key={i} style={{
          fontSize: isMobile ? 11 : 12, paddingLeft: 12, marginBottom: 2,
          borderLeft: '2px solid ' + (r.realizedPnl >= 0 ? '#ff4d4f' : '#52c41a'),
        }}>
          <Text type="secondary" style={{ fontSize: 'inherit' }}>第{i + 1}层 → {r.buyTime}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 'inherit' }}>
            {r.quantity} 股 × ({sellPrice.toFixed(4)} − {r.costPerShare.toFixed(4)}) ={' '}
          </Text>
          <Text strong style={{ color: pnlColor(r.realizedPnl), fontSize: 'inherit' }}>{r.realizedPnl.toFixed(2)}</Text>
        </div>
      ))}
    </>
  );
}
