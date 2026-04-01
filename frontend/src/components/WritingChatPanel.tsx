import { useState, useRef, useEffect } from 'react';
import { Drawer, Input, Button, Space, Typography, message } from 'antd';
import { SendOutlined, CopyOutlined, SnippetsOutlined } from '@ant-design/icons';
import { useSSE } from '../hooks/useSSE';
import { writingApi } from '../api';

const { Text } = Typography;

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

interface WritingChatPanelProps {
  open: boolean;
  onClose: () => void;
  paperContext: string;
  projectName: string;
  onInsertText?: (text: string) => void;
}

export default function WritingChatPanel({
  open,
  onClose,
  paperContext,
  projectName,
  onInsertText,
}: WritingChatPanelProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const accumulatedRef = useRef('');
  const { start, stop } = useSSE();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);
    accumulatedRef.current = '';

    // Add placeholder assistant message
    setMessages([...newMessages, { role: 'assistant', content: '' }]);

    start(writingApi.aiChatUrl, {
      project: projectName,
      messages: newMessages.map(m => ({ role: m.role, content: m.content })),
      paper_context: paperContext.slice(0, 5000),
    }, {
      onMessage: (chunk) => {
        accumulatedRef.current += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulatedRef.current };
          return updated;
        });
      },
      onDone: () => {
        setStreaming(false);
      },
      onError: (err) => {
        message.error('AI 对话失败: ' + err);
        setStreaming(false);
      },
    });
  };

  const handleStop = () => {
    stop();
    setStreaming(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制');
  };

  return (
    <Drawer
      title="AI 写作助手"
      placement="right"
      mask={false}
      width={380}
      open={open}
      onClose={onClose}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}
    >
      {/* Messages area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', marginTop: 40 }}>
            <p>你好！我是论文写作助手。</p>
            <p style={{ fontSize: 12 }}>可以问我 LaTeX 语法、论文结构、写作建议等问题。</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`writing-chat-bubble ${msg.role}`}
          >
            <div className="writing-chat-bubble-content">
              {msg.content || (streaming && i === messages.length - 1 ? '思考中...' : '')}
            </div>
            {msg.role === 'assistant' && msg.content && (
              <div className="writing-chat-bubble-actions">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(msg.content)}
                />
                {onInsertText && (
                  <Button
                    type="text"
                    size="small"
                    icon={<SnippetsOutlined />}
                    onClick={() => onInsertText(msg.content)}
                    title="插入到编辑器"
                  />
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0' }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="输入问题..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onPressEnter={handleSend}
            disabled={streaming}
          />
          {streaming ? (
            <Button onClick={handleStop} danger>停止</Button>
          ) : (
            <Button type="primary" icon={<SendOutlined />} onClick={handleSend} disabled={!input.trim()} />
          )}
        </Space.Compact>
      </div>
    </Drawer>
  );
}
