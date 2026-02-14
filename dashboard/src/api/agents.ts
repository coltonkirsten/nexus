import axios from 'axios';
import type { Agent, AgentConfig, CreateAgentRequest, SendMessageRequest, ConversationResponse, SessionInfo } from '../types/agent';

const api = axios.create({
  baseURL: 'http://localhost:3001',
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function listAgents(): Promise<Agent[]> {
  const response = await api.get<Agent[]>('/api/agents');
  return response.data;
}

export async function getAgent(id: string): Promise<Agent> {
  const response = await api.get<Agent>(`/api/agents/${id}`);
  return response.data;
}

export async function createAgent(data: CreateAgentRequest): Promise<Agent> {
  const response = await api.post<Agent>('/api/agents', data);
  return response.data;
}

export async function deleteAgent(id: string): Promise<void> {
  await api.delete(`/api/agents/${id}`);
}

export async function sendMessage(agentId: string, data: SendMessageRequest): Promise<void> {
  await api.post(`/api/agents/${agentId}/message`, data);
}

export async function startAgent(id: string): Promise<Agent> {
  const response = await api.post<Agent>(`/api/agents/${id}/start`);
  return response.data;
}

export async function stopAgent(id: string): Promise<Agent> {
  const response = await api.post<Agent>(`/api/agents/${id}/stop`);
  return response.data;
}

export function getLogsStreamUrl(agentId: string): string {
  return `http://localhost:3001/api/agents/${agentId}/logs`;
}

export async function updateAgentConfig(agentId: string, config: AgentConfig): Promise<Agent> {
  const response = await api.patch<Agent>(`/api/agents/${agentId}`, { config });
  return response.data;
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
  await api.put(`/api/agents/${agentId}/identity`, { content });
}

export async function updateMemory(agentId: string, content: string): Promise<void> {
  await api.put(`/api/agents/${agentId}/memory`, { content });
}

// History API

export interface Invocation {
  id: string;
  timestamp: string;
  input: string;
  result: string;
  status: 'success' | 'error';
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

// Conversation Mode API

export async function sendConversationMessage(
  agentId: string,
  message: string,
  sessionId?: string
): Promise<ConversationResponse> {
  const response = await api.post<ConversationResponse>(
    `/api/agents/${agentId}/conversation`,
    { message, sessionId }
  );
  return response.data;
}

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
