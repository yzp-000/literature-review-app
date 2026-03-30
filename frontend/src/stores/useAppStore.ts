import { create } from 'zustand';
import { workspaceApi, paperApi } from '../api';

interface Workspace {
  name: string;
  path: string;
  paper_count: number;
  created_at: string;
}

interface Paper {
  id: string;
  number: number;
  title_zh: string;
  title_en: string;
  authors: string[];
  year: number | null;
  journal: string;
  doi: string;
  keywords: string[];
  category_id: string;
  tags: string[];
  status: string;
  pdf_path: string;
  markdown_path: string;
  relations: any[];
  llm_record: any;
  created_at: string;
  updated_at: string;
}

interface AppStore {
  // Workspace state
  workspaces: Workspace[];
  currentWorkspace: string | null;
  loadingWorkspaces: boolean;

  // Paper state
  papers: Paper[];
  currentPaper: Paper | null;
  loadingPapers: boolean;

  // Actions
  fetchWorkspaces: () => Promise<void>;
  setCurrentWorkspace: (name: string | null) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  deleteWorkspace: (name: string) => Promise<void>;

  fetchPapers: (workspace?: string) => Promise<void>;
  setCurrentPaper: (paper: Paper | null) => void;
  createPaper: (data: any) => Promise<Paper>;
  updatePaper: (id: string, data: any) => Promise<Paper>;
  deletePaper: (id: string) => Promise<void>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  loadingWorkspaces: false,

  papers: [],
  currentPaper: null,
  loadingPapers: false,

  fetchWorkspaces: async () => {
    set({ loadingWorkspaces: true });
    try {
      const data = await workspaceApi.list();
      set({ workspaces: data, loadingWorkspaces: false });
    } catch {
      set({ loadingWorkspaces: false });
    }
  },

  setCurrentWorkspace: (name) => {
    set({ currentWorkspace: name, papers: [], currentPaper: null });
    if (name) {
      get().fetchPapers(name);
    }
  },

  createWorkspace: async (name) => {
    const ws = await workspaceApi.create(name);
    await get().fetchWorkspaces();
    return ws;
  },

  deleteWorkspace: async (name) => {
    await workspaceApi.delete(name);
    if (get().currentWorkspace === name) {
      set({ currentWorkspace: null });
    }
    await get().fetchWorkspaces();
  },

  fetchPapers: async (workspace?: string) => {
    const ws = workspace || get().currentWorkspace;
    if (!ws) return;
    set({ loadingPapers: true });
    try {
      const data = await paperApi.list(ws);
      set({ papers: data, loadingPapers: false });
    } catch {
      set({ loadingPapers: false });
    }
  },

  setCurrentPaper: (paper) => set({ currentPaper: paper }),

  createPaper: async (data) => {
    const ws = get().currentWorkspace;
    if (!ws) throw new Error('No workspace selected');
    const paper = await paperApi.create(ws, data);
    await get().fetchPapers();
    return paper;
  },

  updatePaper: async (id, data) => {
    const ws = get().currentWorkspace;
    if (!ws) throw new Error('No workspace selected');
    const paper = await paperApi.update(ws, id, data);
    await get().fetchPapers();
    return paper;
  },

  deletePaper: async (id) => {
    const ws = get().currentWorkspace;
    if (!ws) throw new Error('No workspace selected');
    await paperApi.delete(ws, id);
    await get().fetchPapers();
  },
}));
