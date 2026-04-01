import { create } from 'zustand';
import { writingApi } from '../api';

export interface WritingProject {
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
  main_file: string;
  compile_status: string;
}

interface WritingStore {
  projects: WritingProject[];
  currentProject: WritingProject | null;
  loadingProjects: boolean;

  fetchProjects: () => Promise<void>;
  createProject: (name: string, template?: string) => Promise<WritingProject>;
  deleteProject: (name: string) => Promise<void>;
  setCurrentProject: (project: WritingProject | null) => void;
}

export const useWritingStore = create<WritingStore>((set, get) => ({
  projects: [],
  currentProject: null,
  loadingProjects: false,

  fetchProjects: async () => {
    set({ loadingProjects: true });
    try {
      const data = await writingApi.list();
      set({ projects: data, loadingProjects: false });
    } catch {
      set({ loadingProjects: false });
    }
  },

  createProject: async (name, template = 'default') => {
    const proj = await writingApi.create(name, template);
    await get().fetchProjects();
    return proj;
  },

  deleteProject: async (name) => {
    await writingApi.delete(name);
    if (get().currentProject?.name === name) {
      set({ currentProject: null });
    }
    await get().fetchProjects();
  },

  setCurrentProject: (project) => set({ currentProject: project }),
}));
