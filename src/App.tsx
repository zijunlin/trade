import { useState, useEffect } from 'react';
import { Upload, Button, Card, Typography, Space, Collapse, Select, message, Popover, Alert } from 'antd';
import { UploadOutlined, DownloadOutlined, InfoCircleOutlined, RocketOutlined, ShareAltOutlined, CopyOutlined } from '@ant-design/icons';
import type { RcFile } from 'antd/es/upload/interface';
import { useTaxCalculation } from './hooks/useTaxCalculation';
import { CalculationAnimation } from './components/CalculationAnimation';
import { TaxResults } from './components/TaxResults';

const { Title, Text, Paragraph } = Typography;

const TARGET_CURRENCIES = [
  { label: '人民币 (CNY)', value: '人民币' },
  { label: '美元 (USD)', value: '美元' },
  { label: '欧元 (EUR)', value: '欧元' },
  { label: '港币 (HKD)', value: '港币' },
  { label: '日元 (JPY)', value: '日元' },
  { label: '英镑 (GBP)', value: '英镑' },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

const ANIM_STYLES = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .flash-row td { animation: rowFlash 0.6s ease-out; }
  @keyframes rowFlash {
    0% { background: #e6f4ff; }
    30% { background: #bae7ff; }
    100% { background: transparent; }
  }
  @media (max-width: 768px) {
    .mobile-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .mobile-table-wrap .ant-table { min-width: 600px; }
    .mobile-upload-dragger .ant-upload-drag { padding: 20px 16px !important; }
    .mobile-upload-dragger .ant-upload-drag p:not(:last-child) { margin-bottom: 4px !important; }
  }
`;

function App() {
  const isMobile = useIsMobile();
  const { state, handleFile, handlePause, handleResume, handlePrev, handleNext, handleSpeed, handleComplete, handleReview, handleExitReview, handlePlayback, handleSetTargetCurrency } = useTaxCalculation();
  const { animating, reviewing, loading, result, fileName, paused, viewIndex, viewPnl, viewConvertedPnl, viewPositions, stepHistory, speed, playbackPlaying, targetCurrency } = state;

  const showAnimation = animating || reviewing;

  // Show messages when calculation completes
  useEffect(() => {
    if (!result) return;
    if (result.unmatchedSells.length > 0) {
      message.warning(`有 ${result.unmatchedSells.length} 笔卖出无法匹配买入或初始库存`);
    } else if (result.realizedTrades.length === 0) {
      message.info('暂无卖出记录');
    } else {
      message.success(`计算完成，共 ${result.realizedTrades.length} 笔已实现交易`);
    }
  }, [result]);

  const handleBeforeUpload = (file: RcFile) => {
    handleFile(file as File);
    return false;
  };

  const handleExportClick = async () => {
    if (!result || result.realizedTrades.length === 0) {
      message.warning('暂无数据可导出');
      return;
    }
    const { exportTaxResult } = await import('./lib/fifo');
    const data = await exportTaxResult(result);
    const blob = new Blob([data as unknown as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '税务计算结果.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    message.success('导出成功');
  };

  // Share
  const PAGE_URL = window.location.href;
  const SHARE_TITLE = '资本利得计算器 — 股票交易 FIFO 税务计算工具';
  const SHARE_DESC = '基于 FIFO 算法的股票交易税务计算工具，支持盈亏计算、股息汇总、多币种汇率换算。';

  const shareTo = (platform: string) => {
    const url = encodeURIComponent(PAGE_URL);
    const text = encodeURIComponent(`${SHARE_TITLE} ${SHARE_DESC}`);
    const links: Record<string, string> = {
      weibo: `https://service.weibo.com/share/share.php?url=${url}&title=${text}`,
      twitter: `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    };
    if (links[platform]) {
      window.open(links[platform], '_blank', 'width=600,height=400');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(PAGE_URL);
      message.success('链接已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  const shareContent = (
    <Space direction="vertical" size={8}>
      {[
        { key: 'weibo', icon: '🔴', label: '微博' },
        { key: 'twitter', icon: '𝕏', label: 'Twitter' },
        { key: 'telegram', icon: '✈️', label: 'Telegram' },
        { key: 'facebook', icon: '📘', label: 'Facebook' },
      ].map(item => (
        <Button key={item.key} type="text" size="small" onClick={() => shareTo(item.key)} style={{ width: '100%', textAlign: 'left' }}>
          {item.icon} {item.label}
        </Button>
      ))}
      <Button type="text" size="small" icon={<CopyOutlined />} onClick={copyLink} style={{ width: '100%', textAlign: 'left' }}>
        复制链接
      </Button>
    </Space>
  );

  const TableWrap = ({ children }: { children: React.ReactNode }) => (
    <div className={isMobile ? 'mobile-table-wrap' : ''}>{children}</div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '12px 8px' : '24px 16px' }}>
      <style>{ANIM_STYLES}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? 12 : 24 }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>资本利得计算器</Title>
        <Popover content={shareContent} title="分享到" trigger="click" placement="bottomRight">
          <Button type="text" icon={<ShareAltOutlined />} size={isMobile ? 'middle' : 'large'} />
        </Popover>
      </div>

      {/* Calculation explanation */}
      <Collapse
        items={[{
          key: 'calc-info',
          label: (
            <Space size={isMobile ? 8 : undefined}>
              <InfoCircleOutlined />
              <Text strong>计算说明</Text>
            </Space>
          ),
          children: (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {/* 数据源 & 隐私声明 */}
              <Alert
                type="info"
                showIcon
                icon={<span style={{ fontSize: 16 }}>📋</span>}
                message="当前仅支持富途年度账单（年度账单.xlsx）"
                description={
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Paragraph style={{ margin: 0, fontSize: isMobile ? 13 : 14 }}>
                      请从富途牛牛 APP 导出「年度账单.xlsx」文件，系统将从中读取交易记录、持仓、股息和拆股数据。
                      其他格式的交易记录暂不支持。
                    </Paragraph>
                  </Space>
                }
                style={{ borderColor: '#91d5ff', background: '#e6f7ff' }}
              />
              <Alert
                type="success"
                showIcon
                icon={<span style={{ fontSize: 16 }}>🔒</span>}
                message="所有数据在本地处理，不上传任何服务器"
                description={
                  <Paragraph style={{ margin: 0, fontSize: isMobile ? 13 : 14 }}>
                    文件解析、FIFO 计算、汇率换算全部在浏览器本地完成，您的交易数据不会发送到任何远程服务器。
                  </Paragraph>
                }
                style={{ borderColor: '#b7eb8f', background: '#f6ffed' }}
              />
              <div>
                <Paragraph strong style={{ marginBottom: 4 }}>FIFO（先进先出）计算规则</Paragraph>
                <Paragraph style={{ margin: 0 }}>
                  卖出股票时，系统按时间顺序优先匹配最早的买入批次（或初始持仓），以确定该笔卖出的成本价和已实现盈亏。
                  即「先买入的份额先被卖出」，盈亏 = 卖出净收入 − 买入成本。
                </Paragraph>
              </div>
              <div>
                <Paragraph strong style={{ marginBottom: 4 }}>初始仓位读取</Paragraph>
                <Paragraph style={{ margin: 0 }}>
                  初始仓位（期初持仓）从 Excel 文件的「证劵-持仓总览」Sheet 中读取。
                  上传文件前请确保该 Sheet 中包含该股票的期初数量与成本价，否则该股票的卖出记录将无法匹配到对应买入批次。
                </Paragraph>
              </div>
              <div>
                <Paragraph strong style={{ marginBottom: 4 }}>股息处理</Paragraph>
                <Paragraph style={{ margin: 0 }}>
                  股息收入与股息税从 Excel 中的股息记录读取，分别计入「股息收入」和「股息税」列。
                  盈亏合计 = 已实现盈亏 + 股息收入（不含股息税）。
                </Paragraph>
              </div>
              <div>
                <Paragraph strong style={{ marginBottom: 4 }}>汇率使用说明</Paragraph>
                <Paragraph style={{ margin: 0 }}>
                  系统根据卖出日期查询对应汇率，将盈亏从来源货币（如 USD、EUR）转换为目标货币（默认人民币）。
                  汇率优先从本地缓存（data/exchangeRates.json）查询，未找到则调用国家外汇管理局 API。
                  若当日无数据，自动使用最近有汇率的日期。可在上传前通过「目标货币」下拉框切换。
                </Paragraph>
              </div>
            </Space>
          ),
        }]}
        style={{ marginBottom: isMobile ? 12 : 24 }}
      />

      {/* Upload / Export / Currency card */}
      <Card style={{ marginBottom: isMobile ? 12 : 24 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space direction={isMobile ? 'vertical' : 'horizontal'} size={isMobile ? 12 : 'large'} style={{ width: '100%' }} wrap>
            <div style={{ width: isMobile ? '100%' : 'auto' }}>
              <Upload.Dragger
                accept=".xlsx,.xls,.csv"
                maxCount={1}
                beforeUpload={handleBeforeUpload}
                showUploadList={false}
                className={isMobile ? 'mobile-upload-dragger' : ''}
                style={{ width: '100%' }}
              >
                {fileName && <p style={{ color: '#1677ff', fontSize: isMobile ? 13 : 14 }}>已选择：{fileName}</p>}
                <p style={{ fontSize: isMobile ? 14 : 16 }}>
                  <UploadOutlined /> 点击或拖拽上传富途年度账单
                </p>
                <p style={{ color: '#999', fontSize: isMobile ? 11 : 12 }}>支持 .xlsx, .xls, .csv 格式</p>
              </Upload.Dragger>
              <div style={{ marginTop: 6, fontSize: isMobile ? 11 : 12, textAlign: 'center' }}>
                <span style={{ color: '#52c41a' }}>🔒 本地解析，数据不上传</span>
                <Text type="secondary" style={{ marginLeft: 8 }}>仅支持富途年度账单.xlsx</Text>
              </div>
            </div>

            <Space direction="vertical" size={8} style={{ minWidth: isMobile ? '100%' : 160 }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>目标货币</Text>
              </div>
              <Select
                value={targetCurrency}
                onChange={handleSetTargetCurrency}
                options={TARGET_CURRENCIES}
                style={{ width: '100%' }}
                size={isMobile ? 'middle' : 'large'}
                disabled={animating}
              />
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                size={isMobile ? 'middle' : 'large'}
                block
                onClick={handleExportClick}
                disabled={!result || result.realizedTrades.length === 0}
              >
                导出结果
              </Button>
            </Space>
          </Space>
        </Space>
      </Card>

      {/* Review trigger — shown after calculation completes */}
      {result && !animating && !reviewing && stepHistory.length > 0 && (
        <Card style={{ marginBottom: isMobile ? 12 : 24 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%', textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: isMobile ? 13 : 14 }}>
              计算完成！共 {stepHistory.length} 步交易处理
            </Text>
            <div>
              <Button type="primary" icon={<RocketOutlined />} onClick={handleReview} size={isMobile ? 'middle' : 'large'}>
                查看计算过程
              </Button>
            </div>
          </Space>
        </Card>
      )}

      {/* Animation / Review */}
      {showAnimation && (
        <CalculationAnimation
          animStep={state.animStep}
          animTotal={state.animTotal}
          animTrades={state.animTrades}
          animUnmatched={state.animUnmatched}
          animCurrentTrade={state.animCurrentTrade}
          isMobile={isMobile}
          paused={paused}
          viewIndex={viewIndex}
          viewPnl={viewPnl}
          viewConvertedPnl={viewConvertedPnl}
          viewPositions={viewPositions}
          stepHistory={stepHistory}
          speed={speed}
          targetCurrency={targetCurrency}
          onPause={handlePause}
          onResume={handleResume}
          onPrev={handlePrev}
          onNext={handleNext}
          onSpeed={handleSpeed}
          onComplete={handleComplete}
          reviewing={reviewing}
          playbackPlaying={playbackPlaying}
          onReview={handleReview}
          onExitReview={handleExitReview}
          onPlayback={handlePlayback}
        />
      )}

      {/* Results */}
      {result && !reviewing && (
        <TaxResults result={result} unmatchedSells={result.unmatchedSells} isMobile={isMobile} TableWrap={TableWrap} targetCurrency={targetCurrency} />
      )}

      {/* Fallback loading */}
      {loading && !animating && (
        <Card style={{ textAlign: 'center', padding: isMobile ? 20 : 40 }}>
          <p>正在计算...</p>
        </Card>
      )}
    </div>
  );
}

export default App;
