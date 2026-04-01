import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// ============ Workspaces ============
export const workspaceApi = {
  list: () => api.get('/workspaces').then(r => r.data),
  get: (name: string) => api.get(`/workspaces/${encodeURIComponent(name)}`).then(r => r.data),
  create: (name: string) => api.post('/workspaces', { name }).then(r => r.data),
  delete: (name: string) => api.delete(`/workspaces/${encodeURIComponent(name)}`).then(r => r.data),
};

// ============ Papers ============
export const paperApi = {
  list: (workspace: string, params?: { status?: string; keyword?: string }) =>
    api.get(`/workspaces/${encodeURIComponent(workspace)}/papers`, { params }).then(r => r.data),
  get: (workspace: string, id: string) =>
    api.get(`/workspaces/${encodeURIComponent(workspace)}/papers/${id}`).then(r => r.data),
  create: (workspace: string, data: any) =>
    api.post(`/workspaces/${encodeURIComponent(workspace)}/papers`, data).then(r => r.data),
  update: (workspace: string, id: string, data: any) =>
    api.put(`/workspaces/${encodeURIComponent(workspace)}/papers/${id}`, data).then(r => r.data),
  delete: (workspace: string, id: string) =>
    api.delete(`/workspaces/${encodeURIComponent(workspace)}/papers/${id}`).then(r => r.data),
};

// ============ Files (Markdown) ============
export const fileApi = {
  list: (workspace: string) =>
    api.get(`/workspaces/${encodeURIComponent(workspace)}/files`).then(r => r.data),
  read: (workspace: string, path: string) =>
    api.get(`/workspaces/${encodeURIComponent(workspace)}/files/read`, { params: { path } }).then(r => r.data),
  write: (workspace: string, path: string, content: string) =>
    api.post(`/workspaces/${encodeURIComponent(workspace)}/files/write`, { content }, { params: { path } }).then(r => r.data),
};

// ============ PDF ============
export const pdfApi = {
  upload: (workspace: string, file: File, paperId?: string) => {
    const form = new FormData();
    form.append('file', file);
    const params: any = {};
    if (paperId) params.paper_id = paperId;
    return api.post(`/workspaces/${encodeURIComponent(workspace)}/pdf/upload`, form, {
      params,
      timeout: 60000,
    }).then(r => r.data);
  },
  batchUpload: (workspace: string, files: File[]) => {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    return api.post(`/workspaces/${encodeURIComponent(workspace)}/pdf/batch_upload`, form, {
      timeout: 300000,
    }).then(r => r.data);
  },
  viewUrl: (workspace: string, path: string) =>
    `/api/workspaces/${encodeURIComponent(workspace)}/pdf/view?path=${encodeURIComponent(path)}`,
};

// ============ LLM ============
export const llmApi = {
  chat: (messages: { role: string; content: string }[], providerId?: string) =>
    api.post('/llm/chat', { messages, provider_id: providerId, stream: false }).then(r => r.data),
  streamUrl: '/api/llm/chat',
  generateNoteUrl: '/api/llm/generate_note',
  translateUrl: '/api/llm/translate',
};

// ============ Graph ============
export const graphApi = {
  get: (workspace: string) =>
    api.get(`/workspaces/${encodeURIComponent(workspace)}/graph`).then(r => r.data),
  addRelation: (workspace: string, source_id: string, target_id: string, relation_type: string) =>
    api.post(`/workspaces/${encodeURIComponent(workspace)}/graph/relations`, { source_id, target_id, relation_type }).then(r => r.data),
  removeRelation: (workspace: string, source_id: string, target_id: string, relation_type: string) =>
    api.delete(`/workspaces/${encodeURIComponent(workspace)}/graph/relations`, { data: { source_id, target_id, relation_type } }).then(r => r.data),
};

// ============ Export ============
export const exportApi = {
  exportHtml: (workspace: string, paperIds?: string[], includeCover = true, includeToc = true, aiSummary = '') =>
    api.post(
      `/workspaces/${encodeURIComponent(workspace)}/export`,
      { paper_ids: paperIds || [], include_cover: includeCover, include_toc: includeToc, ai_summary: aiSummary },
    ).then(r => r.data),
  exportSingleHtml: (workspace: string, paperId: string) =>
    api.post(
      `/workspaces/${encodeURIComponent(workspace)}/export/single/${paperId}`,
    ).then(r => r.data),
  aiSummaryUrl: (workspace: string) =>
    `/api/workspaces/${encodeURIComponent(workspace)}/export/ai_summary`,
};

// ============ Settings ============
export const settingsApi = {
  get: () => api.get('/settings').then(r => r.data),
  getBaseDir: () => api.get('/settings/base_dir').then(r => r.data),
  setBaseDir: (base_dir: string) => api.put('/settings/base_dir', { base_dir }).then(r => r.data),
  browseDir: (path?: string) => api.get('/settings/browse', { params: path ? { path } : {} }).then(r => r.data),
  mkdir: (path: string) => api.post('/settings/mkdir', { path }).then(r => r.data),
  listProviders: () => api.get('/settings/providers').then(r => r.data),
  addProvider: (data: any) => api.post('/settings/providers', data).then(r => r.data),
  updateProvider: (id: string, data: any) => api.put(`/settings/providers/${id}`, data).then(r => r.data),
  deleteProvider: (id: string) => api.delete(`/settings/providers/${id}`).then(r => r.data),
  getNoteTemplate: () => api.get('/settings/note_template').then(r => r.data),
  setNoteTemplate: (template: string) => api.put('/settings/note_template', { template }).then(r => r.data),
  resetNoteTemplate: () => api.delete('/settings/note_template').then(r => r.data),
};

// ============ Search ============
export const searchApi = {
  startUrl: '/api/search/start',
  history: (workspace: string) =>
    api.get('/search/history', { params: { workspace } }).then(r => r.data),
  historyDetail: (workspace: string, searchId: string) =>
    api.get(`/search/history/${searchId}`, { params: { workspace } }).then(r => r.data),
  deleteHistory: (workspace: string, searchId: string) =>
    api.delete(`/search/history/${searchId}`, { params: { workspace } }).then(r => r.data),
};

// ============ Writing ============
export const writingApi = {
  list: () => api.get('/writing/projects').then(r => r.data),
  get: (name: string) => api.get(`/writing/projects/${encodeURIComponent(name)}`).then(r => r.data),
  create: (name: string, template = 'default') =>
    api.post('/writing/projects', { name, template }).then(r => r.data),
  delete: (name: string) => api.delete(`/writing/projects/${encodeURIComponent(name)}`).then(r => r.data),
  listFiles: (name: string) =>
    api.get(`/writing/projects/${encodeURIComponent(name)}/files`).then(r => r.data),
  readFile: (name: string, path: string) =>
    api.get(`/writing/projects/${encodeURIComponent(name)}/files/read`, { params: { path } }).then(r => r.data),
  writeFile: (name: string, path: string, content: string) =>
    api.post(`/writing/projects/${encodeURIComponent(name)}/files/write`, { content }, { params: { path } }).then(r => r.data),
  compile: (name: string) =>
    api.post(`/writing/projects/${encodeURIComponent(name)}/compile`, {}, { timeout: 130000 }).then(r => r.data),
  pdfUrl: (name: string) => `/api/writing/projects/${encodeURIComponent(name)}/pdf`,
  aiContinueUrl: '/api/writing/ai/continue',
  aiPolishUrl: '/api/writing/ai/polish',
  aiGenerateSectionUrl: '/api/writing/ai/generate_section',
  aiChatUrl: '/api/writing/ai/chat',
};

export default api;
