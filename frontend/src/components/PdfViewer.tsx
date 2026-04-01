import { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Spin } from 'antd';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const cMapUrl = new URL(
  'pdfjs-dist/cmaps/',
  import.meta.url,
).toString();

interface PdfViewerProps {
  url: string;
  dragging?: boolean;
}

export default function PdfViewer({ url, dragging }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        pointerEvents: dragging ? 'none' : 'auto',
      }}
    >
      <Document
        file={url}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={<Spin style={{ display: 'block', margin: '40px auto' }} />}
        error={<div style={{ textAlign: 'center', padding: 40, color: '#999' }}>PDF 加载失败</div>}
        options={{
          cMapUrl,
          cMapPacked: true,
        }}
      >
        {numPages > 0 && containerWidth > 0 &&
          Array.from({ length: numPages }, (_, i) => (
            <Page
              key={i + 1}
              pageNumber={i + 1}
              width={containerWidth}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          ))
        }
      </Document>
    </div>
  );
}
