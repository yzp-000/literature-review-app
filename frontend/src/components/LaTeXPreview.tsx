import { useRef, useEffect, useState } from 'react';
import { Alert, Spin } from 'antd';

interface LaTeXPreviewProps {
  content: string;
}

export default function LaTeXPreview({ content }: LaTeXPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      renderLatex(content);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content]);

  const renderLatex = async (tex: string) => {
    if (!containerRef.current) return;
    if (!tex.trim()) {
      containerRef.current.innerHTML = '<p style="color:#999;text-align:center;margin-top:40px">暂无内容</p>';
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const latexjs = await import('latex.js');
      const generator = new latexjs.HtmlGenerator({ hyphenate: false });
      const doc = latexjs.parse(tex, { generator });
      const htmlDoc = doc.htmlDocument();

      // Extract body content
      const body = htmlDoc.body;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        // Copy styles
        const styles = htmlDoc.head.querySelectorAll('style, link[rel="stylesheet"]');
        styles.forEach((s: Element) => {
          containerRef.current!.appendChild(s.cloneNode(true));
        });
        // Copy body children
        while (body.firstChild) {
          containerRef.current.appendChild(body.firstChild);
        }
      }
    } catch (e: any) {
      setError(e.message || '预览渲染失败');
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    }
    setLoading(false);
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', position: 'relative' }}>
      {loading && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
          <Spin size="small" />
        </div>
      )}
      {error && (
        <Alert
          message="实时预览不可用"
          description={`latex.js 不支持部分 LaTeX 宏包（如 ctex, tikz 等）。请使用 PDF 编译预览完整效果。错误: ${error}`}
          type="warning"
          showIcon
          closable
          style={{ margin: 8 }}
        />
      )}
      <div
        ref={containerRef}
        className="latex-preview-container"
        style={{ padding: 16, minHeight: 200 }}
      />
    </div>
  );
}
