import { useState, useEffect, useCallback } from 'react';
import {
  Input, Button, Card, Space, Select, Typography, Empty, Tag, message,
  Form, InputNumber, Table, Progress, Collapse, Popconfirm, Divider, Tooltip, Steps, Switch,
} from 'antd';
import {
  SearchOutlined, HistoryOutlined, DeleteOutlined, CheckCircleOutlined,
  FilePdfOutlined, CloseCircleOutlined, LoadingOutlined, RocketOutlined,
  StopOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../stores/useAppStore';
import { useBackgroundTaskStore } from '../stores/useBackgroundTaskStore';
import { searchApi, settingsApi } from '../api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface SearchResult {
  id?: string;
  number?: number;
  title_en: string;
  title_zh?: string;
  authors: string[];
  year?: number;
  journal?: string;
  doi?: string;
  keywords?: string[];
  summary?: string;
  verified?: boolean;
  has_pdf?: boolean;
  note_generated?: boolean;
  error?: string;
}

interface HistoryRecord {
  id: string;
  timestamp: string;
  params: {
    direction: string;
    paper_count: number;
    year_start?: number;
    year_end?: number;
    extra_requirements?: string;
  };
  results: SearchResult[];
  stats: { total: number; verified: number; has_pdf: number; notes_generated?: number };
}

/* =========== Stage descriptions for the progress stepper =========== */
const STAGE_STEPS = [
  { key: 'llm', title: 'AI 检索' },
  { key: 'verify', title: '数据库验证' },
  { key: 'download', title: 'PDF 下载' },
  { key: 'import', title: '导入文献库' },
  { key: 'generate', title: '生成总结' },
];

function stageToStep(stage: string): number {
  if (stage.startsWith('llm')) return 0;
  if (stage.startsWith('verify')) return 1;
  if (stage.startsWith('download')) return 2;
  if (stage.startsWith('import')) return 3;
  if (stage.startsWith('generate')) return 4;
  if (stage === 'done') return 5;
  return 0;
}

export default function SearchPage() {
  const { currentWorkspace, fetchPapers } = useAppStore();
  const [form] = Form.useForm();
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | undefined>();

  // Subscribe to background search task
  const search = useBackgroundTaskStore((s) => s.search);
  const startSearch = useBackgroundTaskStore((s) => s.startSearch);
  const stopSearch = useBackgroundTaskStore((s) => s.stopSearch);
  const resetSearch = useBackgroundTaskStore((s) => s.resetSearch);

  // Derive searching state, scoped to current workspace
  const isCurrentWorkspace = search.workspace === currentWorkspace;
  const searching = search.status === 'running' && isCurrentWorkspace;
  const currentStage = isCurrentWorkspace ? search.currentStage : '';
  const stageMessage = isCurrentWorkspace ? search.stageMessage : '';
  const progressCurrent = isCurrentWorkspace ? search.progressCurrent : 0;
  const progressTotal = isCurrentWorkspace ? search.progressTotal : 0;
  const results = isCurrentWorkspace ? search.results : null;
  const stats = isCurrentWorkspace ? search.stats : null;

  // History
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeView, setActiveView] = useState<'search' | 'history'>('search');
  const [viewingRecord, setViewingRecord] = useState<HistoryRecord | null>(null);

  useEffect(() => {
    settingsApi.listProviders().then(setProviders).catch(() => {});
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoadingHistory(true);
    try {
      const data = await searchApi.history(currentWorkspace);
      setHistory(data);
    } catch { /* ignore */ }
    setLoadingHistory(false);
  }, [currentWorkspace]);

  useEffect(() => {
    if (currentWorkspace) fetchHistory();
  }, [currentWorkspace, fetchHistory]);

  // When search completes, refresh history & papers
  useEffect(() => {
    if (isCurrentWorkspace && (search.status === 'done' || search.status === 'error')) {
      fetchHistory();
      fetchPapers();
    }
  }, [search.status, isCurrentWorkspace]);

  if (!currentWorkspace) {
    return <Empty description="请先选择一个课题" />;
  }

  /* ==================== Search handler ==================== */
  const handleSearch = async () => {
    try {
      await form.validateFields();
    } catch { return; }

    const values = form.getFieldsValue();
    startSearch({
      workspace: currentWorkspace,
      direction: values.direction,
      paper_count: values.paper_count || 10,
      year_start: values.year_start || null,
      year_end: values.year_end || null,
      extra_requirements: values.extra_requirements || '',
      provider_id: selectedProvider || null,
      auto_generate_notes: values.auto_generate_notes || false,
    });
  };

  const handleStop = () => {
    stopSearch();
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await searchApi.deleteHistory(currentWorkspace, id);
      message.success('已删除');
      fetchHistory();
      if (viewingRecord?.id === id) setViewingRecord(null);
    } catch {
      message.error('删除失败');
    }
  };

  /* ==================== Render helpers ==================== */

  const renderResultsTable = (data: SearchResult[]) => {
    const columns = [
      {
        title: '#',
        key: 'idx',
        width: 45,
        render: (_: any, __: any, i: number) => i + 1,
      },
      {
        title: '标题',
        key: 'title',
        render: (_: any, r: SearchResult) => (
          <div>
            <div style={{ fontWeight: 500 }}>{r.title_en || r.title_zh || '未知'}</div>
            {r.title_zh && r.title_en && <Text type="secondary" style={{ fontSize: 12 }}>{r.title_zh}</Text>}
            {r.summary && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{r.summary}</div>}
          </div>
        ),
      },
      {
        title: '作者',
        key: 'authors',
        width: 180,
        render: (_: any, r: SearchResult) => (
          <Text style={{ fontSize: 12 }}>{(r.authors || []).slice(0, 3).join(', ')}{(r.authors || []).length > 3 ? ' ...' : ''}</Text>
        ),
      },
      { title: '年份', dataIndex: 'year', key: 'year', width: 65 },
      {
        title: '状态',
        key: 'status',
        width: 120,
        render: (_: any, r: SearchResult) => (
          <Space direction="vertical" size={2}>
            {r.verified ? (
              <Tag icon={<CheckCircleOutlined />} color="success">已验证</Tag>
            ) : (
              <Tag icon={<CloseCircleOutlined />} color="warning">待验证</Tag>
            )}
            {r.has_pdf ? (
              <Tag icon={<FilePdfOutlined />} color="blue">PDF 已下载</Tag>
            ) : (
              <Tag color="default">无 PDF</Tag>
            )}
            {r.note_generated && (
              <Tag icon={<FileTextOutlined />} color="purple">已生成总结</Tag>
            )}
          </Space>
        ),
      },
    ];

    return (
      <Table
        dataSource={data}
        columns={columns}
        rowKey={(_, i) => String(i)}
        size="small"
        pagination={false}
        style={{ marginTop: 12 }}
      />
    );
  };

  const renderProgressArea = () => {
    if (!searching && !results) return null;

    const stepIdx = stageToStep(currentStage);
    const genEnabled = form.getFieldValue('auto_generate_notes');
    const totalSteps = STAGE_STEPS.length;
    const doneIdx = genEnabled ? totalSteps : totalSteps; // always use totalSteps for done

    return (
      <Card style={{ marginBottom: 16 }}>
        <Steps
          current={searching ? stepIdx : doneIdx}
          status={currentStage === 'error' ? 'error' : searching ? 'process' : 'finish'}
          size="small"
          items={STAGE_STEPS.map((s, i) => ({
            title: s.title,
            icon: searching && stepIdx === i ? <LoadingOutlined /> : undefined,
            ...(s.key === 'generate' && !genEnabled ? { status: 'wait' as const, description: '未开启' } : {}),
          }))}
          style={{ marginBottom: 16 }}
        />

        {searching && (
          <div style={{ marginBottom: 12 }}>
            <Text>{stageMessage}</Text>
            {progressTotal > 0 && (
              <Progress
                percent={Math.round((progressCurrent / progressTotal) * 100)}
                size="small"
                format={() => `${progressCurrent}/${progressTotal}`}
                style={{ maxWidth: 300, marginTop: 4 }}
              />
            )}
          </div>
        )}

        {stats && (
          <Space split={<Divider type="vertical" />} style={{ marginBottom: 8 }}>
            <Text>共 <Text strong>{stats.total}</Text> 篇</Text>
            <Text>已验证 <Text strong type="success">{stats.verified}</Text> 篇</Text>
            <Text>已下载 PDF <Text strong type="success">{stats.has_pdf}</Text> 篇</Text>
            {(stats.notes_generated !== undefined && stats.notes_generated > 0) && (
              <Text>已生成总结 <Text strong type="success">{stats.notes_generated}</Text> 篇</Text>
            )}
          </Space>
        )}

        {results && renderResultsTable(results)}
      </Card>
    );
  };

  /* ==================== JSX ==================== */
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>文献检索</Title>
        <Space>
          <Button
            type={activeView === 'search' ? 'primary' : 'default'}
            icon={<SearchOutlined />}
            onClick={() => { setActiveView('search'); setViewingRecord(null); }}
          >
            新检索
          </Button>
          <Button
            type={activeView === 'history' ? 'primary' : 'default'}
            icon={<HistoryOutlined />}
            onClick={() => setActiveView('history')}
          >
            历史记录{history.length > 0 && ` (${history.length})`}
          </Button>
          <Select
            placeholder="LLM 提供商"
            value={selectedProvider}
            onChange={setSelectedProvider}
            options={providers.map(p => ({ label: p.name, value: p.id }))}
            style={{ width: 140 }}
            allowClear
          />
        </Space>
      </div>

      {/* ========== Search View ========== */}
      {activeView === 'search' && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Form form={form} layout="vertical" initialValues={{ paper_count: 10 }}>
              <Form.Item
                name="direction"
                label="研究方向 / 关键词"
                rules={[{ required: true, message: '请输入研究方向' }]}
              >
                <TextArea
                  placeholder="例：POMDP 在传感器缺失场景下机械臂运动规划中的应用"
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
              </Form.Item>
              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item name="paper_count" label="论文数量" style={{ width: 120 }}>
                  <InputNumber min={1} max={30} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="year_start" label="起始年份" style={{ width: 120 }}>
                  <InputNumber min={1990} max={2026} placeholder="如 2020" style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="year_end" label="截止年份" style={{ width: 120 }}>
                  <InputNumber min={1990} max={2026} placeholder="如 2025" style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <Form.Item name="extra_requirements" label="其他要求（可选）">
                <TextArea
                  placeholder="例：偏好顶会论文（ICRA, IROS, CoRL）、需要包含仿真实验、侧重深度学习方法等"
                  autoSize={{ minRows: 1, maxRows: 3 }}
                />
              </Form.Item>
              <Form.Item name="auto_generate_notes" label="自动生成论文总结" valuePropName="checked" initialValue={false}
                tooltip="导入后自动为每篇论文调用 AI 生成 7 节结构化笔记（有 PDF 则基于全文，无 PDF 则基于元数据）"
              >
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Form>

            <Space>
              {searching ? (
                <Button danger icon={<StopOutlined />} onClick={handleStop}>
                  停止检索
                </Button>
              ) : (
                <Button type="primary" icon={<RocketOutlined />} onClick={handleSearch} size="large">
                  开始检索
                </Button>
              )}
              <Text type="secondary">
                检索流程：AI 推荐 → CrossRef 验证 → 尝试下载 PDF → 导入文献库{form.getFieldValue('auto_generate_notes') ? ' → AI 生成总结' : ''}
              </Text>
            </Space>
          </Card>

          {renderProgressArea()}
        </>
      )}

      {/* ========== History View ========== */}
      {activeView === 'history' && !viewingRecord && (
        <Card>
          {history.length === 0 ? (
            <Empty description="暂无检索记录" />
          ) : (
            <div>
              {history.map((rec) => (
                <Card
                  key={rec.id}
                  size="small"
                  hoverable
                  style={{ marginBottom: 8, cursor: 'pointer' }}
                  onClick={() => setViewingRecord(rec)}
                  extra={
                    <Popconfirm
                      title="确认删除此记录？"
                      onConfirm={(e) => { e?.stopPropagation(); handleDeleteHistory(rec.id); }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  }
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <Text strong>{rec.params.direction}</Text>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        {new Date(rec.timestamp).toLocaleString('zh-CN')}
                        {' · '}
                        {rec.params.paper_count} 篇
                        {rec.params.year_start && ` · ${rec.params.year_start}`}
                        {rec.params.year_end && `-${rec.params.year_end}`}
                        {rec.params.extra_requirements && ` · ${rec.params.extra_requirements}`}
                      </div>
                    </div>
                    <Space>
                      <Tag>{rec.stats.total} 篇</Tag>
                      <Tag color="green">{rec.stats.verified} 已验证</Tag>
                      <Tag color="blue">{rec.stats.has_pdf} 有 PDF</Tag>
                      {(rec.stats.notes_generated ?? 0) > 0 && <Tag color="purple">{rec.stats.notes_generated} 已总结</Tag>}
                    </Space>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ========== History Detail ========== */}
      {activeView === 'history' && viewingRecord && (
        <div>
          <Button onClick={() => setViewingRecord(null)} style={{ marginBottom: 12 }}>
            ← 返回列表
          </Button>
          <Card
            title={
              <div>
                <Text strong>{viewingRecord.params.direction}</Text>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 'normal' }}>
                  {new Date(viewingRecord.timestamp).toLocaleString('zh-CN')}
                </div>
              </div>
            }
            extra={
              <Space>
                <Tag>{viewingRecord.stats.total} 篇</Tag>
                <Tag color="green">{viewingRecord.stats.verified} 已验证</Tag>
                <Tag color="blue">{viewingRecord.stats.has_pdf} 有 PDF</Tag>
                {(viewingRecord.stats.notes_generated ?? 0) > 0 && <Tag color="purple">{viewingRecord.stats.notes_generated} 已总结</Tag>}
              </Space>
            }
          >
            <div style={{ marginBottom: 12 }}>
              <Space split={<Divider type="vertical" />}>
                <Text>数量: {viewingRecord.params.paper_count}</Text>
                {viewingRecord.params.year_start && <Text>起始: {viewingRecord.params.year_start}</Text>}
                {viewingRecord.params.year_end && <Text>截止: {viewingRecord.params.year_end}</Text>}
                {viewingRecord.params.extra_requirements && <Text>要求: {viewingRecord.params.extra_requirements}</Text>}
              </Space>
            </div>
            {renderResultsTable(viewingRecord.results)}
          </Card>
        </div>
      )}
    </div>
  );
}
