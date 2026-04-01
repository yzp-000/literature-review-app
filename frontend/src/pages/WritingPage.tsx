import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Space, Typography, message, Tooltip, Modal, Input, Badge, Spin,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlayCircleOutlined, MessageOutlined,
  RobotOutlined, HighlightOutlined, FileTextOutlined, FilePdfOutlined,
  DesktopOutlined,
} from '@ant-design/icons';
import type { EditorView } from '@codemirror/view';
import { writingApi } from '../api';
import { useSSE } from '../hooks/useSSE';
import LaTeXEditor from '../components/LaTeXEditor';
import LaTeXPreview from '../components/LaTeXPreview';
import PdfViewer from '../components/PdfViewer';
import WritingChatPanel from '../components/WritingChatPanel';

const { Text } = Typography;

export default function WritingPage() {
  const { projectName } = useParams<{ projectName: string }>();
  const navigate = useNavigate();
  const name = decodeURIComponent(projectName || '');

  // Editor state
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const editorViewRef = useRef<EditorView | null>(null);

  // Preview state
  const [previewMode, setPreviewMode] = useState<'live' | 'pdf'>('live');
  const [pdfKey, setPdfKey] = useState(0);

  // Split pane
  const [splitPercent, setSplitPercent] = useState(50);
  const [dragging, setDragging] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  // Chat panel
  const [chatOpen, setChatOpen] = useState(false);

  // Compile state
  const [compiling, setCompiling] = useState(false);
  const [compileLog, setCompileLog] = useState('');
  const [compileLogOpen, setCompileLogOpen] = useState(false);

  // AI state
  const [aiWorking, setAiWorking] = useState(false);
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [sectionTitle, setSectionTitle] = useState('');
  const [sectionNotes, setSectionNotes] = useState('');
  const { start: startSSE, stop: stopSSE } = useSSE();

  // Unsaved changes
  const isDirty = content !== savedContent;

  // Load project file
  useEffect(() => {
    if (!name) return;
    setLoading(true);
    writingApi.readFile(name, 'main.tex')
      .then(data => {
        setContent(data.content);
        setSavedContent(data.content);
      })
      .catch(() => {
        setContent('');
        setSavedContent('');
      })
      .finally(() => setLoading(false));
  }, [name]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Save
  const handleSave = useCallback(async () => {
    if (!name) return;
    setSaving(true);
    try {
      await writingApi.writeFile(name, 'main.tex', content);
      setSavedContent(content);
      message.success('保存成功');
    } catch {
      message.error('保存失败');
    }
    setSaving(false);
  }, [name, content]);

  // Compile
  const handleCompile = async () => {
    if (!name) return;
    // Auto-save before compile
    if (isDirty) {
      try {
        await writingApi.writeFile(name, 'main.tex', content);
        setSavedContent(content);
      } catch {
        message.error('保存失败，无法编译');
        return;
      }
    }
    setCompiling(true);
    try {
      const result = await writingApi.compile(name);
      if (result.success) {
        message.success(`编译成功 (${(result.duration_ms / 1000).toFixed(1)}s)`);
        setPreviewMode('pdf');
        setPdfKey(k => k + 1);
      } else {
        message.error('编译失败');
        setCompileLog(result.log || '未知错误');
        setCompileLogOpen(true);
      }
    } catch (e: any) {
      message.error('编译请求失败: ' + (e.message || ''));
    }
    setCompiling(false);
  };

  // Split pane drag
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

  // ===== AI Operations =====

  // Get cursor position info from editor
  const getEditorInfo = () => {
    const view = editorViewRef.current;
    if (!view) return null;
    const state = view.state;
    const head = state.selection.main.head;
    const from = state.selection.main.from;
    const to = state.selection.main.to;
    const doc = state.doc.toString();
    return { view, head, from, to, doc, hasSelection: from !== to };
  };

  // AI Continue
  const handleAIContinue = () => {
    const info = getEditorInfo();
    if (!info) return;
    setAiWorking(true);

    const contextBefore = info.doc.slice(Math.max(0, info.head - 3000), info.head);
    const contextAfter = info.doc.slice(info.head, info.head + 500);
    let insertPos = info.head;
    let buffer = '';
    let lastFlush = Date.now();

    startSSE(writingApi.aiContinueUrl, {
      project: name,
      context_before: contextBefore,
      context_after: contextAfter,
    }, {
      onMessage: (chunk) => {
        buffer += chunk;
        const now = Date.now();
        if (now - lastFlush > 50) {
          const view = editorViewRef.current;
          if (view && buffer) {
            view.dispatch({ changes: { from: insertPos, insert: buffer } });
            insertPos += buffer.length;
            // Update content state
            setContent(view.state.doc.toString());
            buffer = '';
          }
          lastFlush = now;
        }
      },
      onDone: () => {
        // Flush remaining
        const view = editorViewRef.current;
        if (view && buffer) {
          view.dispatch({ changes: { from: insertPos, insert: buffer } });
          setContent(view.state.doc.toString());
        }
        setAiWorking(false);
        message.success('AI 续写完成');
      },
      onError: (err) => {
        const view = editorViewRef.current;
        if (view && buffer) {
          view.dispatch({ changes: { from: insertPos, insert: buffer } });
          setContent(view.state.doc.toString());
        }
        setAiWorking(false);
        message.error('AI 续写失败: ' + err);
      },
    });
  };

  // AI Polish
  const handleAIPolish = () => {
    const info = getEditorInfo();
    if (!info || !info.hasSelection) {
      message.warning('请先选中需要润色的文本');
      return;
    }
    setAiWorking(true);

    const selectedText = info.doc.slice(info.from, info.to);
    let accumulated = '';

    startSSE(writingApi.aiPolishUrl, {
      project: name,
      selected_text: selectedText,
    }, {
      onMessage: (chunk) => {
        accumulated += chunk;
      },
      onDone: () => {
        const view = editorViewRef.current;
        if (view && accumulated) {
          // Replace selected text with polished result
          const currentFrom = info.from;
          const currentTo = info.to;
          view.dispatch({ changes: { from: currentFrom, to: currentTo, insert: accumulated } });
          setContent(view.state.doc.toString());
        }
        setAiWorking(false);
        message.success('AI 润色完成');
      },
      onError: (err) => {
        setAiWorking(false);
        message.error('AI 润色失败: ' + err);
      },
    });
  };

  // AI Generate Section
  const handleAIGenerateSection = () => {
    if (!sectionTitle.trim()) {
      message.warning('请输入章节标题');
      return;
    }
    setSectionModalOpen(false);
    setAiWorking(true);

    const info = getEditorInfo();
    let insertPos = info?.head ?? content.length;
    let buffer = '';
    let lastFlush = Date.now();

    startSSE(writingApi.aiGenerateSectionUrl, {
      project: name,
      section_title: sectionTitle,
      notes: sectionNotes,
      existing_content: content.slice(0, 3000),
    }, {
      onMessage: (chunk) => {
        buffer += chunk;
        const now = Date.now();
        if (now - lastFlush > 50) {
          const view = editorViewRef.current;
          if (view && buffer) {
            view.dispatch({ changes: { from: insertPos, insert: buffer } });
            insertPos += buffer.length;
            setContent(view.state.doc.toString());
            buffer = '';
          }
          lastFlush = now;
        }
      },
      onDone: () => {
        const view = editorViewRef.current;
        if (view && buffer) {
          view.dispatch({ changes: { from: insertPos, insert: buffer } });
          setContent(view.state.doc.toString());
        }
        setAiWorking(false);
        setSectionTitle('');
        setSectionNotes('');
        message.success('AI 章节生成完成');
      },
      onError: (err) => {
        const view = editorViewRef.current;
        if (view && buffer) {
          view.dispatch({ changes: { from: insertPos, insert: buffer } });
          setContent(view.state.doc.toString());
        }
        setAiWorking(false);
        message.error('AI 生成失败: ' + err);
      },
    });
  };

  // Stop AI
  const handleStopAI = () => {
    stopSSE();
    setAiWorking(false);
  };

  // Insert text from chat panel
  const handleInsertFromChat = (text: string) => {
    const view = editorViewRef.current;
    if (!view) return;
    const pos = view.state.selection.main.head;
    view.dispatch({ changes: { from: pos, insert: text } });
    setContent(view.state.doc.toString());
    message.success('已插入到编辑器');
  };

  // Cursor position info
  const getCursorInfo = () => {
    const view = editorViewRef.current;
    if (!view) return { line: 1, col: 1 };
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    return { line: line.number, col: pos - line.from + 1 };
  };

  const cursorInfo = getCursorInfo();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="writing-page">
      {/* Toolbar */}
      <div className="writing-toolbar">
        <Space>
          <Button
            size="small"
            icon={<ArrowLeftOutlined />}
            onClick={() => {
              if (isDirty && !window.confirm('有未保存的更改，确定离开？')) return;
              navigate('/writing');
            }}
          >
            返回
          </Button>
          <Text strong style={{ fontSize: 14 }}>{name}</Text>
          {isDirty && <Badge status="warning" text="未保存" />}
        </Space>

        <Space size={4}>
          {aiWorking ? (
            <Button size="small" danger onClick={handleStopAI}>停止 AI</Button>
          ) : (
            <>
              <Tooltip title="AI 续写（从光标位置继续）">
                <Button size="small" icon={<RobotOutlined />} onClick={handleAIContinue}>
                  AI续写
                </Button>
              </Tooltip>
              <Tooltip title="AI 润色（选中文本）">
                <Button size="small" icon={<HighlightOutlined />} onClick={handleAIPolish}>
                  AI润色
                </Button>
              </Tooltip>
              <Tooltip title="AI 生成章节内容">
                <Button size="small" icon={<FileTextOutlined />} onClick={() => setSectionModalOpen(true)}>
                  AI生成章节
                </Button>
              </Tooltip>
            </>
          )}
          <div style={{ width: 1, height: 20, background: '#d9d9d9', margin: '0 4px' }} />
          <Button
            size="small"
            icon={<PlayCircleOutlined />}
            loading={compiling}
            onClick={handleCompile}
          >
            编译PDF
          </Button>
        </Space>

        <Space size={4}>
          <Tooltip title="实时预览">
            <Button
              size="small"
              type={previewMode === 'live' ? 'primary' : 'default'}
              icon={<DesktopOutlined />}
              onClick={() => setPreviewMode('live')}
            />
          </Tooltip>
          <Tooltip title="PDF 预览">
            <Button
              size="small"
              type={previewMode === 'pdf' ? 'primary' : 'default'}
              icon={<FilePdfOutlined />}
              onClick={() => setPreviewMode('pdf')}
            />
          </Tooltip>
          <Button
            size="small"
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
          >
            保存
          </Button>
          <Tooltip title="AI 对话">
            <Button
              size="small"
              icon={<MessageOutlined />}
              type={chatOpen ? 'primary' : 'default'}
              onClick={() => setChatOpen(!chatOpen)}
            />
          </Tooltip>
        </Space>
      </div>

      {/* Main split view */}
      <div className="writing-split-view" ref={splitContainerRef}>
        {/* Left: Editor */}
        <div
          className="split-panel"
          style={{ width: `${splitPercent}%`, display: 'flex', flexDirection: 'column' }}
        >
          <LaTeXEditor
            value={content}
            onChange={setContent}
            editorViewRef={editorViewRef}
            onSave={handleSave}
          />
        </div>

        {/* Drag handle */}
        <div
          className={`split-handle${dragging ? ' dragging' : ''}`}
          onMouseDown={handleMouseDown}
        />

        {/* Right: Preview */}
        <div
          className="split-panel"
          style={{
            width: `calc(${100 - splitPercent}% - 6px)`,
            background: '#fff',
            pointerEvents: dragging ? 'none' : 'auto',
          }}
        >
          {previewMode === 'live' ? (
            <LaTeXPreview content={content} />
          ) : (
            <PdfViewer
              key={pdfKey}
              url={writingApi.pdfUrl(name) + `?t=${pdfKey}`}
              dragging={dragging}
            />
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="writing-statusbar">
        <Space size={16}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {compiling ? '编译中...' : `编译状态: ${compileLog ? '有日志' : '就绪'}`}
          </Text>
          {compileLog && (
            <Button type="link" size="small" onClick={() => setCompileLogOpen(true)} style={{ fontSize: 12, padding: 0 }}>
              查看编译日志
            </Button>
          )}
        </Space>
        <Space size={16}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            行 {cursorInfo.line}, 列 {cursorInfo.col}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {content.length} 字符
          </Text>
        </Space>
      </div>

      {/* Chat Panel */}
      <WritingChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        paperContext={content}
        projectName={name}
        onInsertText={handleInsertFromChat}
      />

      {/* Generate Section Modal */}
      <Modal
        title="AI 生成章节"
        open={sectionModalOpen}
        onOk={handleAIGenerateSection}
        onCancel={() => { setSectionModalOpen(false); setSectionTitle(''); setSectionNotes(''); }}
        okText="生成"
        cancelText="取消"
      >
        <div style={{ marginBottom: 12 }}>
          <Text strong>章节标题</Text>
          <Input
            placeholder="如：实验结果与分析"
            value={sectionTitle}
            onChange={e => setSectionTitle(e.target.value)}
            style={{ marginTop: 4 }}
            autoFocus
          />
        </div>
        <div>
          <Text strong>写作要点（可选）</Text>
          <Input.TextArea
            placeholder="描述该章节需要包含的内容、要点或特殊要求"
            value={sectionNotes}
            onChange={e => setSectionNotes(e.target.value)}
            rows={3}
            style={{ marginTop: 4 }}
          />
        </div>
      </Modal>

      {/* Compile Log Modal */}
      <Modal
        title="编译日志"
        open={compileLogOpen}
        onCancel={() => setCompileLogOpen(false)}
        footer={<Button onClick={() => setCompileLogOpen(false)}>关闭</Button>}
        width={700}
      >
        <pre className="writing-compile-log">
          {compileLog || '无日志'}
        </pre>
      </Modal>
    </div>
  );
}
