import { create } from 'zustand';
import { message } from 'antd';
import { searchApi, llmApi, exportApi } from '../api';
import { useAppStore } from './useAppStore';

/* ============================================================
 * Search task types
 * ============================================================ */
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

interface SearchStats {
  total: number;
  verified: number;
  has_pdf: number;
  notes_generated?: number;
}

type TaskStatus = 'idle' | 'running' | 'done' | 'error';

interface SearchSlot {
  status: TaskStatus;
  workspace: string | null;
  currentStage: string;
  stageMessage: string;
  progressCurrent: number;
  progressTotal: number;
  results: SearchResult[] | null;
  stats: SearchStats | null;
  error: string | null;
}

/* ============================================================
 * NoteGen task types
 * ============================================================ */
interface NoteGenSlot {
  status: TaskStatus;
  workspace: string | null;
  paperId: string | null;
  generatedContent: string;
  error: string | null;
}

/* ============================================================
 * ExportSummary task types
 * ============================================================ */
interface ExportSummarySlot {
  status: TaskStatus;
  workspace: string | null;
  aiSummary: string;
  error: string | null;
}

/* ============================================================
 * Store interface
 * ============================================================ */
interface BackgroundTaskStore {
  search: SearchSlot;
  noteGen: NoteGenSlot;
  exportSummary: ExportSummarySlot;

  // Internal abort controllers (not exposed via get, managed internally)
  _searchAbort: AbortController | null;
  _noteGenAbort: AbortController | null;
  _exportSummaryAbort: AbortController | null;

  // Search actions
  startSearch: (params: {
    workspace: string;
    direction: string;
    paper_count: number;
    year_start?: number | null;
    year_end?: number | null;
    extra_requirements?: string;
    provider_id?: string | null;
    auto_generate_notes?: boolean;
  }) => void;
  stopSearch: () => void;
  resetSearch: () => void;

  // NoteGen actions
  startNoteGen: (params: {
    workspace: string;
    paperId: string;
    pdfPath: string;
    maxPdfPages?: number;
  }) => void;
  stopNoteGen: () => void;
  resetNoteGen: () => void;

  // ExportSummary actions
  startExportSummary: (params: {
    workspace: string;
    paperIds: string[];
  }) => void;
  stopExportSummary: () => void;
  resetExportSummary: () => void;
  setExportSummaryContent: (content: string) => void;
}

/* ============================================================
 * Initial slot states
 * ============================================================ */
const INITIAL_SEARCH: SearchSlot = {
  status: 'idle',
  workspace: null,
  currentStage: '',
  stageMessage: '',
  progressCurrent: 0,
  progressTotal: 0,
  results: null,
  stats: null,
  error: null,
};

const INITIAL_NOTE_GEN: NoteGenSlot = {
  status: 'idle',
  workspace: null,
  paperId: null,
  generatedContent: '',
  error: null,
};

const INITIAL_EXPORT_SUMMARY: ExportSummarySlot = {
  status: 'idle',
  workspace: null,
  aiSummary: '',
  error: null,
};

/* ============================================================
 * Throttle helper – limits set() calls for token-stream slots
 * ============================================================ */
function createThrottledSetter(set: any, slotKey: 'noteGen' | 'exportSummary', intervalMs = 50) {
  let pending: Record<string, any> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (patch: Record<string, any>) => {
    pending = { ...pending, ...patch };
    if (!timer) {
      timer = setTimeout(() => {
        if (pending) {
          set((s: BackgroundTaskStore) => ({ [slotKey]: { ...s[slotKey], ...pending } }));
          pending = null;
        }
        timer = null;
      }, intervalMs);
    }
  };
}

/* ============================================================
 * Store
 * ============================================================ */
export const useBackgroundTaskStore = create<BackgroundTaskStore>((set, get) => ({
  search: { ...INITIAL_SEARCH },
  noteGen: { ...INITIAL_NOTE_GEN },
  exportSummary: { ...INITIAL_EXPORT_SUMMARY },

  _searchAbort: null,
  _noteGenAbort: null,
  _exportSummaryAbort: null,

  /* ======================== Search ======================== */
  startSearch: (params) => {
    // Abort previous
    get()._searchAbort?.abort();
    const controller = new AbortController();
    set({
      _searchAbort: controller,
      search: {
        status: 'running',
        workspace: params.workspace,
        currentStage: 'llm',
        stageMessage: '正在启动 AI 检索...',
        progressCurrent: 0,
        progressTotal: 0,
        results: null,
        stats: null,
        error: null,
      },
    });

    // Fire-and-forget async IIFE
    (async () => {
      try {
        const resp = await fetch(searchApi.startUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace: params.workspace,
            direction: params.direction,
            paper_count: params.paper_count || 10,
            year_start: params.year_start || null,
            year_end: params.year_end || null,
            extra_requirements: params.extra_requirements || '',
            provider_id: params.provider_id || null,
            auto_import: true,
            auto_generate_notes: params.auto_generate_notes || false,
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
                const { stage } = data;
                if (!stage) continue;

                const patch: Partial<SearchSlot> = { currentStage: stage };
                if (data.message) patch.stageMessage = data.message;
                if (data.current && data.total) {
                  patch.progressCurrent = data.current;
                  patch.progressTotal = data.total;
                }
                if (stage === 'done') {
                  patch.status = 'done';
                  patch.results = data.results || [];
                  patch.stats = data.stats || null;
                  message.success(`检索完成：共 ${data.stats?.total || 0} 篇论文`);
                }
                if (stage === 'error') {
                  patch.status = 'error';
                  patch.error = data.message || '检索出错';
                  message.error(data.message || '检索出错');
                }

                set((s) => ({ search: { ...s.search, ...patch } }));
              } catch { /* ignore parse errors */ }
            }
          }
        }

        // If not already done/error, mark as done
        const current = get().search;
        if (current.status === 'running') {
          set((s) => ({ search: { ...s.search, status: 'done' } }));
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          message.error('检索失败: ' + (e.message || ''));
          set((s) => ({ search: { ...s.search, status: 'error', error: e.message || '' } }));
        } else {
          // Aborted – set idle if still running
          const current = get().search;
          if (current.status === 'running') {
            set((s) => ({ search: { ...s.search, status: 'idle' } }));
          }
        }
      }

      // After completion, refresh history & papers
      const st = get().search;
      if (st.status === 'done' || st.status === 'error') {
        const appStore = useAppStore.getState();
        appStore.fetchPapers();
      }
    })();
  },

  stopSearch: () => {
    get()._searchAbort?.abort();
    set((s) => ({
      _searchAbort: null,
      search: { ...s.search, status: s.search.status === 'running' ? 'idle' : s.search.status },
    }));
  },

  resetSearch: () => {
    get()._searchAbort?.abort();
    set({ _searchAbort: null, search: { ...INITIAL_SEARCH } });
  },

  /* ======================== NoteGen ======================== */
  startNoteGen: (params) => {
    get()._noteGenAbort?.abort();
    const controller = new AbortController();

    set({
      _noteGenAbort: controller,
      noteGen: {
        status: 'running',
        workspace: params.workspace,
        paperId: params.paperId,
        generatedContent: '',
        error: null,
      },
    });

    const throttledSet = createThrottledSetter(set, 'noteGen');

    (async () => {
      let accumulated = '';
      try {
        const resp = await fetch(llmApi.generateNoteUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace: params.workspace,
            paper_id: params.paperId,
            max_pdf_pages: params.maxPdfPages || 15,
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
                  throttledSet({ generatedContent: accumulated });
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

        // Ensure final content is flushed
        set((s) => ({
          noteGen: { ...s.noteGen, status: 'done', generatedContent: accumulated },
        }));
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          message.error('AI 生成失败: ' + (e.message || ''));
          set((s) => ({
            noteGen: { ...s.noteGen, status: 'error', generatedContent: accumulated, error: e.message || '' },
          }));
        } else {
          // Aborted – keep accumulated content, mark idle
          set((s) => ({
            noteGen: { ...s.noteGen, status: accumulated ? 'done' : 'idle', generatedContent: accumulated },
          }));
        }
      }
    })();
  },

  stopNoteGen: () => {
    get()._noteGenAbort?.abort();
    set({ _noteGenAbort: null });
  },

  resetNoteGen: () => {
    get()._noteGenAbort?.abort();
    set({ _noteGenAbort: null, noteGen: { ...INITIAL_NOTE_GEN } });
  },

  /* ======================== ExportSummary ======================== */
  startExportSummary: (params) => {
    get()._exportSummaryAbort?.abort();
    const controller = new AbortController();

    set({
      _exportSummaryAbort: controller,
      exportSummary: {
        status: 'running',
        workspace: params.workspace,
        aiSummary: '',
        error: null,
      },
    });

    const throttledSet = createThrottledSetter(set, 'exportSummary');

    (async () => {
      let accumulated = '';
      try {
        const resp = await fetch(exportApi.aiSummaryUrl(params.workspace), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paper_ids: params.paperIds.length ? params.paperIds : [],
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
                  throttledSet({ aiSummary: accumulated });
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

        // Ensure final content is flushed
        set((s) => ({
          exportSummary: { ...s.exportSummary, status: 'done', aiSummary: accumulated },
        }));
        message.success('AI 综合总结生成完成');
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          message.error('生成失败: ' + (e.message || ''));
          set((s) => ({
            exportSummary: { ...s.exportSummary, status: 'error', aiSummary: accumulated, error: e.message || '' },
          }));
        } else {
          // Aborted – keep accumulated content
          set((s) => ({
            exportSummary: { ...s.exportSummary, status: accumulated ? 'done' : 'idle', aiSummary: accumulated },
          }));
        }
      }
    })();
  },

  stopExportSummary: () => {
    get()._exportSummaryAbort?.abort();
    set({ _exportSummaryAbort: null });
  },

  resetExportSummary: () => {
    get()._exportSummaryAbort?.abort();
    set({ _exportSummaryAbort: null, exportSummary: { ...INITIAL_EXPORT_SUMMARY } });
  },

  setExportSummaryContent: (content) => {
    set((s) => ({ exportSummary: { ...s.exportSummary, aiSummary: content } }));
  },
}));
