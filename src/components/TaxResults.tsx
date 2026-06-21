import { Card, Table, Statistic, Row, Col, Tabs, Typography, Alert } from 'antd';
import type { TaxCalculationResult, UnmatchedSell, RealizedTrade, DividendSummary } from '../lib/fifo';

const { Text } = Typography;

// 股息汇总列
function createDividendColumns(targetCurrency: string) {
  return [
    { title: '股票', dataIndex: 'stockCode', key: 'stockCode', width: 100 },
    {
      title: '股息收入', dataIndex: 'income', key: 'income', width: 130, align: 'right' as const,
      render: (val: number, record: DividendSummary) => (
        <div>
          <div>
            {val.toFixed(2)}
            <Text type="secondary" style={{ fontSize: 10, marginLeft: 2 }}>({record.incomeCount}笔)</Text>
          </div>
          {record.convertedIncome != null && record.convertedIncome !== val && (
            <div style={{ fontSize: 11, color: '#999' }}>{record.convertedIncome.toFixed(2)} {targetCurrency}</div>
          )}
        </div>
      ),
    },
    {
      title: '股息税', dataIndex: 'tax', key: 'tax', width: 130, align: 'right' as const,
      render: (val: number, record: DividendSummary) => (
        <div>
          <div>
            {val !== 0 ? val.toFixed(2) : '-'}
            {record.taxCount > 0 && (
              <Text type="secondary" style={{ fontSize: 10, marginLeft: 2 }}>({record.taxCount}笔)</Text>
            )}
          </div>
          {record.convertedTax != null && record.convertedTax !== val && (
            <div style={{ fontSize: 11, color: '#999' }}>{record.convertedTax.toFixed(2)} {targetCurrency}</div>
          )}
        </div>
      ),
    },
    {
      title: '净股息', dataIndex: 'net', key: 'net', width: 130, align: 'right' as const,
      render: (val: number, record: DividendSummary) => (
        <div>
          <div style={{ color: pnlColor(val), fontWeight: 600 }}>{val.toFixed(2)}</div>
          {record.convertedNet != null && record.convertedNet !== val && (
            <div style={{ fontSize: 11, color: '#999' }}>{record.convertedNet.toFixed(2)} {targetCurrency}</div>
          )}
        </div>
      ),
    },
  ];
}

const UNMATCHED_COLUMNS = [
  { title: '股票', dataIndex: 'stockCode', key: 'stockCode', width: 100 },
  { title: '卖出时间', dataIndex: 'sellTime', key: 'sellTime', width: 110 },
  { title: '未匹配数量', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right' as const },
  {
    title: '卖出价', dataIndex: 'sellPrice', key: 'sellPrice', width: 100, align: 'right' as const,
    render: (val: number) => val.toFixed(4),
  },
];

function pnlColor(val: number) {
  return val >= 0 ? '#cf1322' : '#389e0d';
}

function createDetailColumns(targetCurrency: string) {
  return [
    { title: '买入来源', dataIndex: 'buyTime', key: 'buyTime', width: 110 },
    { title: '卖出时间', dataIndex: 'sellTime', key: 'sellTime', width: 110 },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const },
    {
      title: '成本价', dataIndex: 'costPerShare', key: 'costPerShare', width: 100, align: 'right' as const,
      render: (val: number) => val.toFixed(4),
    },
    {
      title: '卖出价', dataIndex: 'sellPrice', key: 'sellPrice', width: 100, align: 'right' as const,
      render: (val: number) => val.toFixed(4),
    },
    {
      title: '仓位', dataIndex: 'positionBefore', key: 'positionBefore', width: 100, align: 'right' as const,
      render: (val: number) => val != null ? val.toFixed(2) : '-',
    },
    {
      title: '已实现盈亏', dataIndex: 'realizedPnl', key: 'realizedPnl', width: 140, align: 'right' as const,
      render: (val: number, record: RealizedTrade) => (
        <div>
          <div style={{ color: pnlColor(val), fontWeight: 600 }}>
            {val.toFixed(2)}
            {record.sourceCurrency && (
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>{record.sourceCurrency}</Text>
            )}
          </div>
          {record.convertedPnl != null && record.exchangeRate && (
            <div style={{ fontSize: 11, color: '#999' }}>
              {record.convertedPnl.toFixed(2)} {targetCurrency}
              {' '}
              <Text type="secondary" style={{ fontSize: 10 }}>({record.exchangeRate.toFixed(4)})</Text>
            </div>
          )}
        </div>
      ),
    },
  ];
}

interface Props {
  result: TaxCalculationResult;
  unmatchedSells: UnmatchedSell[];
  isMobile: boolean;
  TableWrap: ({ children }: { children: React.ReactNode }) => React.ReactElement;
  targetCurrency: string;
}

export function TaxResults({ result, unmatchedSells, isMobile, TableWrap, targetCurrency }: Props) {
  const detailColumns = createDetailColumns(targetCurrency);
  const dividendColumns = createDividendColumns(targetCurrency);

  const { pnlSummary, dividendResult } = result;
  const dividendSummaries = dividendResult?.summaries || [];

  return (
    <>
      {/* Unmatched sells warning */}
      {unmatchedSells.length > 0 && (
        <Alert
          message={`有 ${unmatchedSells.length} 笔卖出无法匹配买入或初始库存`}
          description="请检查「证劵-持仓总览」sheet 中是否包含该股票的期初持仓"
          type="warning"
          showIcon
          style={{ marginBottom: isMobile ? 12 : 24 }}
        />
      )}

      {unmatchedSells.length > 0 && (
        <Card title="未匹配卖出" style={{ marginBottom: isMobile ? 12 : 24 }}>
          <TableWrap>
            <Table
              columns={UNMATCHED_COLUMNS}
              dataSource={unmatchedSells}
              rowKey={(_, i) => `unmatched-${i}`}
              pagination={false}
              size={isMobile ? 'small' : 'middle'}
            />
          </TableWrap>
        </Card>
      )}

      {result.realizedTrades.length > 0 && (
        <>
          {/* Summary Cards */}
          <Row gutter={isMobile ? 8 : 16} style={{ marginBottom: isMobile ? 12 : 24 }}>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="盈亏合计"
                  value={pnlSummary.totalRealizedPnl}
                  precision={2}
                  valueStyle={{ color: pnlColor(pnlSummary.totalRealizedPnl) }}
                />
                {pnlSummary.totalConvertedPnl !== 0 && (
                  <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>
                    {pnlSummary.totalConvertedPnl.toFixed(2)} {targetCurrency}
                  </div>
                )}
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="股息收入合计"
                  value={pnlSummary.totalDivIncome}
                  precision={2}
                  valueStyle={{ color: pnlSummary.totalDivIncome > 0 ? '#cf1322' : '#8c8c8c' }}
                />
                {pnlSummary.totalDivConvertedIncome !== 0 && (
                  <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>
                    {pnlSummary.totalDivConvertedIncome.toFixed(2)} {targetCurrency}
                  </div>
                )}
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="股息税合计"
                  value={pnlSummary.totalDivTax}
                  precision={2}
                  valueStyle={{ color: pnlSummary.totalDivTax < 0 ? '#389e0d' : '#8c8c8c' }}
                />
                {pnlSummary.totalDivConvertedTax !== 0 && (
                  <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>
                    {pnlSummary.totalDivConvertedTax.toFixed(2)} {targetCurrency}
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          {/* 股息明细 */}
          {dividendSummaries.length > 0 && (
            <Card title="股息明细" style={{ marginBottom: isMobile ? 12 : 24 }}>
                <TableWrap>
                  <Table
                    columns={dividendColumns}
                    dataSource={dividendSummaries}
                    rowKey={(record) => `${record.stockCode}-${record.currency || 'unknown'}`}
                    pagination={false}
                    size={isMobile ? 'small' : 'middle'}
                    summary={(pageData) => {
                      const income = pageData.reduce((s, d) => s + d.income, 0);
                      const tax = pageData.reduce((s, d) => s + d.tax, 0);
                      const net = pageData.reduce((s, d) => s + d.net, 0);
                      const convertedIncome = pageData.reduce((s, d) => s + (d.convertedIncome ?? 0), 0);
                      const convertedTax = pageData.reduce((s, d) => s + (d.convertedTax ?? 0), 0);
                      const convertedNet = pageData.reduce((s, d) => s + (d.convertedNet ?? 0), 0);
                      const incCount = pageData.reduce((s, d) => s + d.incomeCount, 0);
                      const taxCount = pageData.reduce((s, d) => s + d.taxCount, 0);
                      const hasConversion = convertedIncome !== 0 || convertedTax !== 0;
                      return (
                        <Table.Summary fixed>
                          <Table.Summary.Row style={{ fontWeight: 700 }}>
                            <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
                            <Table.Summary.Cell index={1}>
                              <div>
                                <div>
                                  <span>{income.toFixed(2)}</span>
                                  <Text type="secondary" style={{ fontSize: 10, marginLeft: 2 }}>({incCount}笔)</Text>
                                </div>
                                {hasConversion && (
                                  <div style={{ fontSize: 11, color: '#999' }}>{convertedIncome.toFixed(2)} {targetCurrency}</div>
                                )}
                              </div>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={2}>
                              <div>
                                <div>
                                  {tax !== 0 ? tax.toFixed(2) : '-'}
                                  {taxCount > 0 && (
                                    <Text type="secondary" style={{ fontSize: 10, marginLeft: 2 }}>({taxCount}笔)</Text>
                                  )}
                                </div>
                                {hasConversion && (
                                  <div style={{ fontSize: 11, color: '#999' }}>{convertedTax.toFixed(2)} {targetCurrency}</div>
                                )}
                              </div>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={3}>
                              <div>
                                <div style={{ color: pnlColor(net) }}>{net.toFixed(2)}</div>
                                {hasConversion && (
                                  <div style={{ fontSize: 11, color: '#999' }}>{convertedNet.toFixed(2)} {targetCurrency}</div>
                                )}
                              </div>
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        </Table.Summary>
                      );
                    }}
                  />
                </TableWrap>
              </Card>
          )}

          {/* Detail Tabs by stock */}
          <Card title="盈亏明细">
            <Tabs
              items={Array.from(result.tradesByStock.entries()).map(([stockCode, trades]) => {
                const stockPnl = trades.reduce((sum, t) => sum + t.realizedPnl, 0);
                const stockConverted = trades.reduce((sum, t) => sum + (t.convertedPnl || 0), 0);
                return {
                  key: stockCode,
                  label: (
                    <span>
                      {stockCode}（{stockPnl.toFixed(2)}
                      {stockConverted !== 0 && (
                        <Text type="secondary" style={{ fontSize: 11 }}> / {stockConverted.toFixed(2)} {targetCurrency}</Text>
                      )}
                      ）
                    </span>
                  ),
                  children: (
                    <TableWrap>
                      <Table
                        key={stockCode}
                        columns={detailColumns}
                        dataSource={trades}
                        rowKey={(_, i) => `${stockCode}-${i}`}
                        pagination={{ pageSize: isMobile ? 20 : 120, showSizeChanger: !isMobile, showTotal: (total: number) => `共 ${total} 条` }}
                        size={isMobile ? 'small' : 'middle'}
                        summary={(pageData) => {
                          const total = pageData.reduce((sum, item) => sum + item.realizedPnl, 0);
                          const totalConv = pageData.reduce((sum, item) => sum + (item.convertedPnl || 0), 0);
                          return (
                            <Table.Summary fixed>
                              <Table.Summary.Row style={{ fontWeight: 700 }}>
                                <Table.Summary.Cell index={0} colSpan={5}>合计</Table.Summary.Cell>
                                <Table.Summary.Cell index={1}>
                                  <div>
                                    <div style={{ color: pnlColor(total) }}>{total.toFixed(2)}</div>
                                    {totalConv !== 0 && (
                                      <div style={{ fontSize: 11, color: '#999' }}>
                                        {totalConv.toFixed(2)} {targetCurrency}
                                      </div>
                                    )}
                                  </div>
                                </Table.Summary.Cell>
                              </Table.Summary.Row>
                            </Table.Summary>
                          );
                        }}
                      />
                    </TableWrap>
                  ),
                };
              })}
            />
          </Card>
        </>
      )}
    </>
  );
}
