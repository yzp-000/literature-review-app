import { useEffect, useRef, useState } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { llmApi } from '../api';

interface TranslationPopupProps {
  text: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export default function TranslationPopup({ text, position, onClose }: TranslationPopupProps) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  // Compute position avoiding viewport edges
  const computeStyle = (): React.CSSProperties => {
    const popupW = 380;
    const popupH = 320;
    let x = position.x;
    let y = position.y + 10; // offset below cursor

    if (x + popupW > window.innerWidth - 16) {
      x = window.innerWidth - popupW - 16;
    }
    if (x < 16) x = 16;
    if (y + popupH > window.innerHeight - 16) {
      y = position.y - popupH - 10; // flip above cursor
    }
    if (y < 16) y = 16;

    return { left: x, top: y };
  };

  // Stream translation
  useEffect(() => {
    setResult('');
    setError('');
    setLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = '';

    (async () => {
      try {
        const resp = await fetch(llmApi.translateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
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
                  setResult(accumulated);
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
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          setError(e.message || '翻译失败');
        }
      }
      setLoading(false);
    })();

    return () => {
      controller.abort();
    };
  }, [text]);

  // Click-outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const sourcePreview = text.length > 80 ? text.slice(0, 80) + '...' : text;

  return (
    <div
      ref={popupRef}
      className="translation-popup"
      style={computeStyle()}
    >
      <div className="translation-popup-header">
        <span>AI 翻译</span>
        <CloseOutlined className="translation-popup-close" onClick={onClose} />
      </div>
      <div className="translation-popup-source">{sourcePreview}</div>
      <div className="translation-popup-divider" />
      <div className="translation-popup-result">
        {error ? (
          <span style={{ color: '#ff4d4f' }}>{error}</span>
        ) : result ? (
          <>{result}{loading && <span className="translation-cursor" />}</>
        ) : loading ? (
          <span style={{ color: '#999' }}>翻译中...</span>
        ) : (
          <span style={{ color: '#999' }}>无结果</span>
        )}
      </div>
    </div>
  );
}
