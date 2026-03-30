import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, Typography, Space, Descriptions, message, Empty, Select, Modal, Progress, Tooltip } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, EditOutlined, EyeOutlined, RobotOutlined, ColumnWidthOutlined } from '@ant-design/icons';
import { useAppStore } from '../stores/useAppStore';
import { fileApi, pdfApi, llmApi } from '../api';
import MarkdownEditor from '../components/MarkdownEditor';
import MarkdownViewer from '../components/MarkdownViewer';

const { Title, Text } = Typography;

const STATUS_OPTIONS = [
  { label: '未读', value: 'unread' },
  { label: '阅读中', value: 'reading' },
  { label: '已完成', value: 'completed' },
];

export default function PaperDetailPage() {
  const { paperId } = useParams<{ paperId: string }>();
  const navigate = useNavigate();
  const { currentWorkspace, papers, fetchPapers, updatePaper } = useAppStore();
  const [markdownContent, setMarkdownContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  // AI generation state
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Split pane state
  const [splitPercent, setSplitPercent] = useState(50); // left panel percentage
  const [dragging, setDragging] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const percent = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(85, Math.max(15, percent)));
    };
    const onMouseUp = () => {
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const paper = papers.find(p => p.id === paperId);

  useEffect(() => {
    if (currentWorkspace && !papers.length) fetchPapers();
  }, [currentWorkspace]);

  useEffect(() => {
    if (paper?.markdown_path && currentWorkspace) {
      setLoading(true);
      fileApi.read(currentWorkspace, paper.markdown_path)
        .then(data => setMarkdownContent(data.content))
        .catch(() => setMarkdownContent(''))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [paper?.markdown_path, currentWorkspace]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  if (!currentWorkspace) return <Empty description="请先选择课题" />;
  if (!paper) return <Empty description="论文不存在" />;

  const handleSave = async () => {
    if (!paper.markdown_path || !currentWorkspace) return;
    setSaving(true);
    try {
      await fileApi.write(currentWorkspace, paper.markdown_path, markdownContent);
      message.success('保存成功');
    } catch {
      message.error('保存失败');
    }
    setSaving(false);
  };

  // ---- AI generate note via SSE ----
  const handleGenerate = async () => {
    if (!paper.pdf_path) {
      message.warning('请先为该论文上传 PDF');
      return;
    }

    setGenerating(true);
    setGeneratedContent('');

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = '';

    try {
      const resp = await fetch(llmApi.generateNoteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: currentWorkspace,
          paper_id: paper.id,
          max_pdf_pages: 15,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || '请求失败');
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr || dataStr === '{}') continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.content) {
                accumulated += data.content;
                setGeneratedContent(accumulated);
              }
              if (data.error) {
                throw new Error(data.error);
              }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes('JSON'))
                throw parseErr;
            }
          }
        }
      }

      setPreviewModalOpen(true);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        message.error('AI 生成失败: ' + (e.message || ''));
      }
    }
    setGenerating(false);
  };

  const handleStopGenerate = () => {
    abortRef.current?.abort();
    setGenerating(false);
    if (generatedContent) {
      setPreviewModalOpen(true);
    }
  };

  // Merge AI-generated content into the existing markdown
  const handleApplyGenerated = () => {
    if (!generatedContent) return;

    // Strategy: keep section 1 (basic info) from template, replace sections 2-7 with AI content
    const lines = markdownContent.split('\n');
    const genLines = generatedContent.split('\n');

    // Find where section 2 starts in the existing note
    let insertIdx = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^##\s*2[\.\s]/)) {
        insertIdx = i;
        break;
      }
    }

    // Keep everything before section 2
    const header = lines.slice(0, insertIdx);

    // From generated content, extract from section 2 onward
    let genStart = 0;
    for (let i = 0; i < genLines.length; i++) {
      if (genLines[i].match(/^##\s*2[\.\s]/)) {
        genStart = i;
        break;
      }
    }
    const genBody = genLines.slice(genStart);

    const merged = [...header, ...genBody].join('\n');
    setMarkdownContent(merged);
    setEditing(true);
    setPreviewModalOpen(false);
    message.success('AI 内容已填入笔记，请检查后保存');
  };

  // Replace entire note with AI content
  const handleReplaceAll = () => {
    if (!generatedContent) return;

    // Build full note: keep the basic info header, append generated sections
    const title = paper.title_zh || paper.title_en || '未命名';
    const authors = paper.authors.join(', ');

    const fullNote = `# ${title}

> **作者**: ${authors}
> **年份**: ${paper.year || ''}
> **期刊/会议**: ${paper.journal || ''}

---

## 1. 论文基本信息

| 项目 | 内容 |
|------|------|
| 标题(中) | ${paper.title_zh || ''} |
| 标题(英) | ${paper.title_en || ''} |
| 作者 | ${authors} |
| 年份 | ${paper.year || ''} |
| 期刊/会议 | ${paper.journal || ''} |
| DOI | ${paper.doi || ''} |
| 关键词 | ${paper.keywords.join(', ')} |

${generatedContent}
`;
    setMarkdownContent(fullNote);
    setEditing(true);
    setPreviewModalOpen(false);
    message.success('AI 内容已填入笔记，请检查后保存');
  };

  const pdfUrl = paper.pdf_path ? pdfApi.viewUrl(currentWorkspace, paper.pdf_path) : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/papers')}>返回列表</Button>
          <Title level={4} style={{ margin: 0 }}>
            #{paper.number} {paper.title_zh || paper.title_en || '未命名'}
          </Title>
        </Space>
        <Space size={4}>
          <Tooltip title="PDF 为主">
            <Button size="small" type={splitPercent > 60 ? 'primary' : 'default'} onClick={() => setSplitPercent(70)}>7:3</Button>
          </Tooltip>
          <Tooltip title="等分">
            <Button size="small" type={splitPercent >= 45 && splitPercent <= 55 ? 'primary' : 'default'} onClick={() => setSplitPercent(50)}>5:5</Button>
          </Tooltip>
          <Tooltip title="笔记为主">
            <Button size="small" type={splitPercent < 40 ? 'primary' : 'default'} onClick={() => setSplitPercent(30)}>3:7</Button>
          </Tooltip>
        </Space>
      </div>

      <Descriptions size="small" column={3} bordered style={{ marginBottom: 16, background: '#fff' }}>
        <Descriptions.Item label="作者">{paper.authors.join(', ') || '-'}</Descriptions.Item>
        <Descriptions.Item label="年份">{paper.year || '-'}</Descriptions.Item>
        <Descriptions.Item label="期刊">{paper.journal || '-'}</Descriptions.Item>
        <Descriptions.Item label="DOI">
          {paper.doi ? (
            <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer">
              {paper.doi}
            </a>
          ) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="关键词">{paper.keywords.join(', ') || '-'}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Select
            size="small"
            value={paper.status}
            options={STATUS_OPTIONS}
            onChange={(v) => updatePaper(paper.id, { status: v })}
            style={{ width: 100 }}
          />
        </Descriptions.Item>
      </Descriptions>

      <div className="paper-split-view" ref={splitContainerRef}>
        {/* Left: PDF viewer */}
        <div
          className="split-panel"
          style={{ width: `${splitPercent}%`, background: '#fff', borderRadius: 8, padding: 8 }}
        >
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 4, pointerEvents: dragging ? 'none' : 'auto' }}
              title="PDF Preview"
            />
          ) : (
            <Empty description="暂无 PDF，请在论文列表中上传" style={{ marginTop: 100 }} />
          )}
        </div>

        {/* Drag handle */}
        <div
          className={`split-handle${dragging ? ' dragging' : ''}`}
          onMouseDown={handleMouseDown}
        />

        {/* Right: Markdown notes */}
        <div
          className="split-panel"
          style={{ width: `calc(${100 - splitPercent}% - 6px)`, background: '#fff', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column' }}
        >
          <Space style={{ marginBottom: 8 }} wrap>
            <Button
              icon={editing ? <EyeOutlined /> : <EditOutlined />}
              onClick={() => setEditing(!editing)}
            >
              {editing ? '预览' : '编辑'}
            </Button>
            {editing && (
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
                保存
              </Button>
            )}
            {generating ? (
              <Button danger onClick={handleStopGenerate}>
                停止生成
              </Button>
            ) : (
              <Button
                icon={<RobotOutlined />}
                onClick={handleGenerate}
                disabled={!paper.pdf_path}
                title={!paper.pdf_path ? '请先上传 PDF' : '使用 AI 自动生成 7 节笔记'}
              >
                AI 生成总结
              </Button>
            )}
          </Space>

          {/* Streaming preview during generation */}
          {generating && (
            <div style={{
              marginBottom: 8,
              padding: '8px 12px',
              background: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: 6,
              fontSize: 13,
              maxHeight: 120,
              overflow: 'auto',
            }}>
              <Text type="secondary"><RobotOutlined /> AI 正在生成中...</Text>
              <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', color: '#333' }}>
                {generatedContent.slice(-200)}
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading ? (
              <Spin style={{ display: 'block', margin: '40px auto' }} />
            ) : editing ? (
              <MarkdownEditor value={markdownContent} onChange={setMarkdownContent} />
            ) : (
              <MarkdownViewer content={markdownContent} />
            )}
          </div>
        </div>
      </div>

      {/* ===== AI Generated Preview Modal ===== */}
      <Modal
        title="AI 生成结果预览"
        open={previewModalOpen}
        onCancel={() => setPreviewModalOpen(false)}
        width={800}
        footer={
          <Space>
            <Button onClick={() => setPreviewModalOpen(false)}>取消</Button>
            <Button onClick={handleApplyGenerated}>
              智能合并（保留第1节，替换2-7节)
            </Button>
            <Button type="primary" onClick={handleReplaceAll}>
              重新生成全部笔记
            </Button>
          </Space>
        }
      >
        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          <MarkdownViewer content={generatedContent || '暂无内容'} />
        </div>
      </Modal>
    </div>
  );
}
