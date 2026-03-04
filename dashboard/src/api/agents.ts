import axios from 'axios';
import type { Agent, AgentConfig, CreateAgentRequest, SendMessageRequest, SessionInfo, CronJob, CronRunRecord, Schedule, CellTypeDefinition, CredentialStore } from '../types/agent';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function listAgents(): Promise<Agent[]> {
  const response = await api.get<{ agents: Agent[] }>('/api/agents');
  return response.data.agents;
}

export async function getAgent(id: string): Promise<Agent> {
  const response = await api.get<{ agent: Agent }>(`/api/agents/${id}`);
  return response.data.agent;
}

export async function createAgent(data: CreateAgentRequest): Promise<Agent> {
  const response = await api.post<{ agent: Agent }>('/api/agents', data);
  return response.data.agent;
}

export async function deleteAgent(id: string, deleteVolumes?: boolean): Promise<void> {
  const params = deleteVolumes ? { deleteVolumes: 'true' } : {};
  await api.delete(`/api/agents/${id}`, { params });
}

export async function renameAgent(agentId: string, name: string): Promise<Agent> {
  const response = await api.patch<{ agent: Agent }>(`/api/agents/${agentId}`, { name });
  return response.data.agent;
}

// Send message - always fire-and-forget, watch SSE for response
export async function sendMessage(agentId: string, data: SendMessageRequest): Promise<void> {
  await api.post(`/api/agents/${agentId}/messages`, data);
}

export async function startAgent(id: string): Promise<void> {
  await api.post(`/api/agents/${id}/start`);
}

export async function cancelAgentTask(agentId: string): Promise<void> {
  await api.post(`/api/agents/${agentId}/cancel`);
}

export async function stopAgent(id: string): Promise<void> {
  await api.post(`/api/agents/${id}/stop`);
}

export async function pauseAgent(id: string, reason?: string): Promise<void> {
  await api.post(`/api/agents/${id}/pause`, reason ? { reason } : undefined);
}

export async function resumeAgent(id: string): Promise<void> {
  await api.post(`/api/agents/${id}/resume`);
}

// Rebuild an agent container (delete and recreate with fresh credentials)
export async function rebuildAgent(id: string): Promise<void> {
  await api.post(`/api/agents/${id}/rebuild`);
}

// Batch operations for multiple agents
export async function startMultipleAgents(
  ids: string[],
  onProgress?: (completed: number, total: number, errors: string[]) => void
): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const errors: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    try {
      await api.post(`/api/agents/${ids[i]}/start`);
      succeeded.push(ids[i]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      failed.push({ id: ids[i], error: errorMsg });
      errors.push(errorMsg);
    }
    onProgress?.(i + 1, ids.length, errors);
  }

  return { succeeded, failed };
}

export async function stopMultipleAgents(
  ids: string[],
  onProgress?: (completed: number, total: number, errors: string[]) => void
): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const errors: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    try {
      await api.post(`/api/agents/${ids[i]}/stop`);
      succeeded.push(ids[i]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      failed.push({ id: ids[i], error: errorMsg });
      errors.push(errorMsg);
    }
    onProgress?.(i + 1, ids.length, errors);
  }

  return { succeeded, failed };
}

export function getLogsStreamUrl(agentId: string): string {
  return `${API_BASE}/api/agents/${agentId}/logs`;
}

export function getTerminalWsUrl(agentId: string): string {
  return `${WS_BASE}/api/agents/${agentId}/terminal`;
}

export async function updateAgentConfig(agentId: string, config: AgentConfig): Promise<Agent> {
  const response = await api.patch<{ agent: Agent }>(`/api/agents/${agentId}`, { config });
  return response.data.agent;
}

// System Prompt API

interface Skill {
  name: string;
  description: string;
  path: string;
}

interface SystemPromptData {
  assembled: string;
  identity: string;
  memory: string;
  skills: Skill[];
}

export async function getSystemPrompt(agentId: string): Promise<SystemPromptData> {
  const response = await api.get<SystemPromptData>(`/api/agents/${agentId}/system-prompt`);
  return response.data;
}

export async function updateIdentity(agentId: string, content: string): Promise<void> {
  await api.put(`/api/agents/${agentId}/ledger/file?path=identity.md`, { content });
}

export async function updateMemory(agentId: string, content: string): Promise<void> {
  await api.put(`/api/agents/${agentId}/ledger/file?path=memory/index.md`, { content });
}

// History API

export interface Invocation {
  id: string;
  timestamp: string;
  input: string;
  result: string;
  status: 'success' | 'error' | 'running';
  durationMs: number;
  tokenUsage: {
    input: number;
    output: number;
  };
  costUsd: number;
}

export interface HistoryResponse {
  invocations: Invocation[];
}

export async function getAgentHistory(agentId: string): Promise<HistoryResponse> {
  const response = await api.get<HistoryResponse>(`/api/agents/${agentId}/history`);
  return response.data;
}

// Session API

export async function getSessionInfo(agentId: string): Promise<SessionInfo> {
  const response = await api.get<SessionInfo>(`/api/agents/${agentId}/session`);
  return response.data;
}

export async function clearSession(agentId: string): Promise<void> {
  await api.post(`/api/agents/${agentId}/session/clear`);
}

// Skills API

export interface SkillData {
  name: string;
  description: string;
  path: string;
  content?: string;
}

export interface SkillsResponse {
  skills: SkillData[];
}

export interface SkillResponse {
  skill: SkillData;
}

export async function listSkills(agentId: string): Promise<SkillData[]> {
  const response = await api.get<SkillsResponse>(`/api/agents/${agentId}/skills`);
  return response.data.skills;
}

export async function getSkill(agentId: string, skillName: string): Promise<SkillData> {
  const response = await api.get<SkillResponse>(`/api/agents/${agentId}/skills/${encodeURIComponent(skillName)}`);
  return response.data.skill;
}

export async function createSkill(
  agentId: string,
  name: string,
  description: string,
  content?: string
): Promise<SkillData> {
  const response = await api.post<SkillResponse>(`/api/agents/${agentId}/skills`, {
    name,
    description,
    content,
  });
  return response.data.skill;
}

export async function updateSkill(
  agentId: string,
  skillName: string,
  content: string
): Promise<SkillData> {
  const response = await api.put<SkillResponse>(
    `/api/agents/${agentId}/skills/${encodeURIComponent(skillName)}`,
    { content }
  );
  return response.data.skill;
}

export async function deleteSkill(agentId: string, skillName: string): Promise<void> {
  await api.delete(`/api/agents/${agentId}/skills/${encodeURIComponent(skillName)}`);
}

// Workspace API

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  children?: FileEntry[];
}

export async function getWorkspaceTree(agentId: string): Promise<{ entries: FileEntry[] }> {
  const response = await api.get<{ entries: FileEntry[] }>(`/api/agents/${agentId}/workspace`);
  return response.data;
}

export async function getWorkspaceFile(agentId: string, path: string): Promise<{ content: string; encoding?: 'utf-8' | 'base64' }> {
  const response = await api.get<{ content: string; encoding?: 'utf-8' | 'base64' }>(`/api/agents/${agentId}/workspace/file`, {
    params: { path },
  });
  return response.data;
}

// Ledger API

export async function getLedgerTree(agentId: string): Promise<{ entries: FileEntry[] }> {
  const response = await api.get<{ entries: FileEntry[] }>(`/api/agents/${agentId}/ledger`);
  return response.data;
}

export async function getLedgerFile(agentId: string, path: string): Promise<{ content: string; encoding?: 'utf-8' | 'base64' }> {
  const response = await api.get<{ content: string; encoding?: 'utf-8' | 'base64' }>(`/api/agents/${agentId}/ledger/file`, {
    params: { path },
  });
  return response.data;
}

export async function saveLedgerFile(agentId: string, path: string, content: string): Promise<void> {
  await api.put(`/api/agents/${agentId}/ledger/file?path=${encodeURIComponent(path)}`, { content });
}

// Cron Jobs API

export async function listCronJobs(agentId: string): Promise<CronJob[]> {
  const response = await api.get<{ jobs: CronJob[] }>(`/api/agents/${agentId}/cron`);
  return response.data.jobs;
}

export async function createCronJob(
  agentId: string,
  data: { name: string; schedule: Schedule; message: string; createdBy?: 'user' | 'agent' }
): Promise<CronJob> {
  const response = await api.post<{ job: CronJob }>(`/api/agents/${agentId}/cron`, data);
  return response.data.job;
}

export async function updateCronJob(
  agentId: string,
  jobId: string,
  data: Partial<{ name: string; schedule: Schedule; message: string; enabled: boolean }>
): Promise<CronJob> {
  const response = await api.patch<{ job: CronJob }>(`/api/agents/${agentId}/cron/${jobId}`, data);
  return response.data.job;
}

export async function deleteCronJob(agentId: string, jobId: string): Promise<void> {
  await api.delete(`/api/agents/${agentId}/cron/${jobId}`);
}

export async function triggerCronJob(agentId: string, jobId: string): Promise<void> {
  await api.post(`/api/agents/${agentId}/cron/${jobId}/trigger`);
}

export async function getCronHistory(agentId: string): Promise<CronRunRecord[]> {
  const response = await api.get<{ history: CronRunRecord[] }>(`/api/agents/${agentId}/cron-history`);
  return response.data.history;
}

// Cell Types API

export async function listCellTypes(): Promise<CellTypeDefinition[]> {
  const response = await api.get<{ cellTypes: CellTypeDefinition[] }>('/api/cell-types');
  return response.data.cellTypes;
}

// Credentials API

export async function getCredentials(): Promise<CredentialStore> {
  const response = await api.get<{ credentials: CredentialStore }>('/api/cell-types/credentials');
  return response.data.credentials;
}

export async function setCredentials(cellType: string, values: Record<string, string>): Promise<void> {
  await api.put(`/api/cell-types/credentials/${cellType}`, values);
}

export async function deleteCredentials(cellType: string): Promise<void> {
  await api.delete(`/api/cell-types/credentials/${cellType}`);
}

// Token Stats API

export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  invocationCount: number;
  sessionStartTime: string;
}

export async function getTokenStats(agentId: string): Promise<TokenStats> {
  const response = await api.get<TokenStats>(`/api/agents/${agentId}/stats/tokens`);
  return response.data;
}
