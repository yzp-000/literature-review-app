import { useRef, useEffect, useCallback } from 'react';

interface SSEOptions {
  onMessage: (data: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

export function useSSE() {
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (url: string, body: any, options: SSEOptions) => {
      // Abort any existing connection
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const err = await resp.text();
          options.onError?.(err);
          return;
        }

        const reader = resp.body?.getReader();
        if (!reader) return;

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
              const dataStr = line.slice(6);
              if (dataStr.trim() === '{}' || !dataStr.trim()) continue;
              try {
                const data = JSON.parse(dataStr);
                if (data.content) {
                  options.onMessage(data.content);
                }
                if (data.error) {
                  options.onError?.(data.error);
                }
              } catch {
                // skip invalid JSON
              }
            }
            if (line.includes('event: done')) {
              options.onDone?.();
            }
            if (line.includes('event: error')) {
              // Next data line will contain error
            }
          }
        }
        options.onDone?.();
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          options.onError?.(e.message);
        }
      }
    },
    []
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { start, stop };
}
