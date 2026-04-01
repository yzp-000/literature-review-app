import { useRef, useEffect, useState } from 'react';
import { Alert, Spin } from 'antd';

interface LaTeXPreviewProps {
  content: string;
}

// latex.js 不支持的宏包列表，预览前剥离
const UNSUPPORTED_PACKAGES = [
  'ctex', 'xeCJK', 'fontspec', 'tikz', 'pgfplots', 'minted', 'listings',
  'algorithm2e', 'algorithmicx', 'biblatex', 'natbib', 'cleveref',
];

/**
 * 对 LaTeX 源码做预处理，移除 latex.js 不支持的宏包和命令，
 * 让基础文本/公式/结构至少能渲染出来。
 */
function sanitizeForPreview(tex: string): string {
  let s = tex;

  // 把 \documentclass[...]{ctexart} 等替换为 article
  s = s.replace(/\\documentclass(\[[^\]]*\])?\{ctex\w*\}/g, '\\documentclass$1{article}');

  // 移除不支持的 \usepackage 行
  const pkgPattern = new RegExp(
    `^\\s*\\\\usepackage(\\[[^\\]]*\\])?\\{(${UNSUPPORTED_PACKAGES.join('|')})(,[^}]*)?\\}\\s*$`,
    'gm'
  );
  s = s.replace(pkgPattern, '% [preview] removed unsupported package');

  // 移除 \setCJKmainfont 等 xeCJK/fontspec 命令
  s = s.replace(/^\\set(CJK)?(main|sans|mono)font(\[[^\]]*\])?\{[^}]*\}\s*$/gm, '');

  // 把 geometry 包保留但用 latex.js 能理解的方式（直接移除也行）
  s = s.replace(/^\\geometry\{[^}]*\}\s*$/gm, '');

  return s;
}

export default function LaTeXPreview({ content }: LaTeXPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasUnsupported, setHasUnsupported] = useState(false);
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
      setHasUnsupported(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 检测是否有不支持的宏包
    const needsSanitize = UNSUPPORTED_PACKAGES.some(
      pkg => tex.includes(`{${pkg}}`) || tex.includes(`{${pkg},`)
    );
    setHasUnsupported(needsSanitize);

    const processedTex = needsSanitize ? sanitizeForPreview(tex) : tex;

    try {
      const latexjs = await import('latex.js');
      const generator = new latexjs.HtmlGenerator({ hyphenate: false });
      const doc = latexjs.parse(processedTex, { generator });
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
      {hasUnsupported && !error && (
        <Alert
          message="实时预览为简化版"
          description="已自动跳过 ctex 等不支持的宏包。中文内容可正常显示，但排版效果以 PDF 编译为准。"
          type="info"
          showIcon
          closable
          style={{ margin: 8 }}
        />
      )}
      {error && (
        <Alert
          message="实时预览失败"
          description={`latex.js 解析出错，请使用「编译 PDF」查看完整效果。错误: ${error}`}
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
