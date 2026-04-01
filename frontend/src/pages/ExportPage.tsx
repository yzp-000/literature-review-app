import { useState, useEffect, useRef } from 'react';
import {
  Typography, Card, Button, Space, Checkbox, message, Empty,
  Switch, Divider, Tag, Tooltip, Input, Alert,
} from 'antd';
import {
  FilePdfOutlined, PrinterOutlined, CheckCircleOutlined,
  RobotOutlined, LoadingOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../stores/useAppStore';
import { useBackgroundTaskStore } from '../stores/useBackgroundTaskStore';
import { exportApi } from '../api';
import MarkdownViewer from '../components/MarkdownViewer';

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  unread: { color: 'default', label: '未读' },
  reading: { color: 'blue', label: '阅读中' },
  completed: { color: 'green', label: '已完成' },
};

export default function ExportPage() {
  const { currentWorkspace, papers, fetchPapers } = useAppStore();
  const [selectedPapers, setSelectedPapers] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [includeCover, setIncludeCover] = useState(true);
  const [includeToc, setIncludeToc] = useState(true);

  // AI summary from background store
  const exportSummary = useBackgroundTaskStore((s) => s.exportSummary);
  const startExportSummary = useBackgroundTaskStore((s) => s.startExportSummary);
  const stopExportSummary = useBackgroundTaskStore((s) => s.stopExportSummary);
  const resetExportSummary = useBackgroundTaskStore((s) => s.resetExportSummary);
  const setExportSummaryContent = useBackgroundTaskStore((s) => s.setExportSummaryContent);

  // Derive state scoped to current workspace
  const isCurrentWorkspace = exportSummary.workspace === currentWorkspace;
  const generating = exportSummary.status === 'running' && isCurrentWorkspace;
  const aiSummary = isCurrentWorkspace ? exportSummary.aiSummary : '';

  // Local UI state
  const [includeAiSummary, setIncludeAiSummary] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    if (currentWorkspace && !papers.length) fetchPapers();
  }, [currentWorkspace]);

  useEffect(() => {
    setSelectedPapers([]);
  }, [currentWorkspace]);

  // Auto-enable includeAiSummary when generation transitions to done
  const prevExportStatus = useRef(exportSummary.status);
  useEffect(() => {
    const prev = prevExportStatus.current;
    prevExportStatus.current = exportSummary.status;
    if (prev === 'running' && isCurrentWorkspace && exportSummary.status === 'done' && exportSummary.aiSummary) {
      setIncludeAiSummary(true);
    }
  }, [exportSummary.status, isCurrentWorkspace]);

  if (!currentWorkspace) return <Empty description="请先选择一个课题" />;

  const selectAll = () => {
    if (selectedPapers.length === papers.length) {
      setSelectedPapers([]);
    } else {
      setSelectedPapers(papers.map(p => p.id));
    }
  };

  // ---- AI summary generation via background store ----
  const handleGenerateSummary = () => {
    setShowPreview(true);
    startExportSummary({
      workspace: currentWorkspace,
      paperIds: selectedPapers.length ? selectedPapers : [],
    });
  };

  const handleStopGenerate = () => {
    stopExportSummary();
  };

  const handleClearSummary = () => {
    resetExportSummary();
    setIncludeAiSummary(false);
  };

  // ---- Export ----
  const doExport = async (triggerPrint: boolean) => {
    setExporting(true);
    try {
      const html = await exportApi.exportHtml(
        currentWorkspace,
        selectedPapers.length ? selectedPapers : undefined,
        includeCover,
        includeToc,
        includeAiSummary ? aiSummary : '',
      );
      const win = window.open('', '_blank');
      if (!win) {
        message.error('浏览器阻止了弹窗，请允许弹窗后重试');
        setExporting(false);
        return;
      }
      win.document.write(html);
      win.document.close();

      if (triggerPrint) {
        win.onload = () => { setTimeout(() => win.print(), 500); };
        setTimeout(() => win.print(), 1500);
        message.success('已打开打印预览，请选择"另存为 PDF"');
      }
    } catch (e: any) {
      message.error('导出失败: ' + (e.response?.data?.detail || e.message || ''));
    }
    setExporting(false);
  };

  const withNotes = papers.filter(p => p.markdown_path);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Title level={3}>导出 PDF</Title>

      {/* Paper selection */}
      <Card title="选择论文" size="small" style={{ marginBottom: 16 }}
        extra={
          <Button type="link" size="small" onClick={selectAll}>
            {selectedPapers.length === papers.length ? '取消全选' : '全选'}
          </Button>
        }
      >
        {papers.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无论文" />
        ) : (
          <Checkbox.Group
            value={selectedPapers}
            onChange={(v) => setSelectedPapers(v as string[])}
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            {papers.map(p => {
              const status = STATUS_MAP[p.status] || STATUS_MAP.unread;
              return (
                <Checkbox key={p.id} value={p.id}>
                  <span style={{ fontSize: 13 }}>
                    <Text style={{ marginRight: 8 }}>#{p.number}</Text>
                    {p.title_zh || p.title_en || '未命名'}
                    <Tag color={status.color} style={{ marginLeft: 8 }}>{status.label}</Tag>
                    {p.markdown_path ? (
                      <Tooltip title="有笔记内容">
                        <CheckCircleOutlined style={{ color: '#52c41a', marginLeft: 4 }} />
                      </Tooltip>
                    ) : (
                      <Text type="secondary" style={{ marginLeft: 4, fontSize: 11 }}>(无笔记)</Text>
                    )}
                  </span>
                </Checkbox>
              );
            })}
          </Checkbox.Group>
        )}
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">
            {selectedPapers.length === 0
              ? `未选择论文时将导出所有 ${papers.length} 篇`
              : `已选择 ${selectedPapers.length} 篇`
            }
            {' '}({withNotes.length} 篇有笔记内容)
          </Text>
        </div>
      </Card>

      {/* Export options */}
      <Card title="导出选项" size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Switch checked={includeCover} onChange={setIncludeCover} size="small" />
            <Text>包含封面页</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Switch checked={includeToc} onChange={setIncludeToc} size="small" />
            <Text>包含目录</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Switch
              checked={includeAiSummary}
              onChange={(v) => setIncludeAiSummary(v)}
              size="small"
              disabled={!aiSummary && !generating}
            />
            <Text>包含 AI 综合总结</Text>
            {!aiSummary && !generating && (
              <Text type="secondary" style={{ fontSize: 11 }}>（请先生成总结）</Text>
            )}
          </div>
        </Space>
      </Card>

      {/* AI Summary section */}
      <Card
        title={
          <Space>
            <RobotOutlined />
            <span>AI 综合总结</span>
            {aiSummary && <Tag color="green">已生成</Tag>}
          </Space>
        }
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Space size={4}>
            {generating ? (
              <Button size="small" danger onClick={handleStopGenerate}>停止生成</Button>
            ) : (
              <Button
                size="small"
                type="primary"
                icon={<RobotOutlined />}
                onClick={handleGenerateSummary}
                disabled={papers.length === 0}
              >
                {aiSummary ? '重新生成' : '生成总结'}
              </Button>
            )}
            {aiSummary && !generating && (
              <>
                <Button
                  size="small"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  {showPreview ? '编辑' : '预览'}
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleClearSummary}
                />
              </>
            )}
          </Space>
        }
      >
        {generating && !aiSummary && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <LoadingOutlined style={{ fontSize: 24, color: '#1890ff' }} />
            <div style={{ marginTop: 8, color: '#666' }}>AI 正在分析论文并生成综合总结...</div>
          </div>
        )}

        {aiSummary && (
          <>
            {generating && (
              <Alert
                message="AI 正在生成中..."
                type="info"
                showIcon
                icon={<LoadingOutlined />}
                style={{ marginBottom: 8 }}
              />
            )}
            {showPreview ? (
              <div style={{ maxHeight: 400, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 4, padding: 12 }}>
                <MarkdownViewer content={aiSummary} />
              </div>
            ) : (
              <TextArea
                value={aiSummary}
                onChange={(e) => setExportSummaryContent(e.target.value)}
                autoSize={{ minRows: 8, maxRows: 20 }}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            )}
          </>
        )}

        {!aiSummary && !generating && (
          <Text type="secondary">
            点击「生成总结」，AI 将根据{selectedPapers.length ? `选中的 ${selectedPapers.length}` : `全部 ${papers.length}`} 篇论文的笔记内容，
            自动生成一份涵盖研究概述、方法对比、趋势分析的综合文献总结，放在导出文档的最前面。
          </Text>
        )}
      </Card>

      {/* Action buttons */}
      <Space size="middle">
        <Button
          type="primary"
          icon={<FilePdfOutlined />}
          size="large"
          loading={exporting}
          onClick={() => doExport(true)}
          disabled={generating}
        >
          导出 PDF ({selectedPapers.length ? `${selectedPapers.length} 篇` : `全部 ${papers.length} 篇`})
        </Button>
        <Button
          icon={<PrinterOutlined />}
          size="large"
          loading={exporting}
          onClick={() => doExport(false)}
          disabled={generating}
        >
          预览 HTML
        </Button>
      </Space>

      <Divider />
      <Text type="secondary" style={{ fontSize: 12 }}>
        提示：点击"导出 PDF"后，浏览器会打开打印预览窗口。在打印对话框中选择"另存为 PDF"（目标打印机选择"Save as PDF"），
        即可保存为 PDF 文件。建议使用 Chrome 或 Edge 浏览器获得最佳效果。
      </Text>
    </div>
  );
}
