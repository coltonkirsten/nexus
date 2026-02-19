import axios from 'axios';
import type { Team, TeamEvent } from '../types/agent';
import type { FileEntry } from './agents';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface TeamMember {
  id: string;
  name: string;
  status: string;
  lastActivity?: string;
}

export async function listTeams(): Promise<Team[]> {
  const response = await api.get<{ teams: Team[] }>('/api/teams');
  return response.data.teams;
}

export async function getTeam(id: string): Promise<Team> {
  const response = await api.get<{ team: Team }>(`/api/teams/${id}`);
  return response.data.team;
}

export async function createTeam(data: { name: string; description?: string }): Promise<Team> {
  const response = await api.post<{ team: Team }>('/api/teams', data);
  return response.data.team;
}

export async function updateTeam(id: string, data: { name?: string; description?: string }): Promise<Team> {
  const response = await api.patch<{ team: Team }>(`/api/teams/${id}`, data);
  return response.data.team;
}

export async function deleteTeam(id: string): Promise<void> {
  await api.delete(`/api/teams/${id}`);
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const response = await api.get<{ members: TeamMember[] }>(`/api/teams/${teamId}/members`);
  return response.data.members;
}

export async function addAgentToTeam(teamId: string, agentId: string): Promise<void> {
  await api.post(`/api/teams/${teamId}/members`, { agentId });
}

export async function removeAgentFromTeam(teamId: string, agentId: string): Promise<void> {
  await api.delete(`/api/teams/${teamId}/members/${agentId}`);
}

export async function getTeamEvents(teamId: string, limit?: number): Promise<TeamEvent[]> {
  const params = limit ? { limit: String(limit) } : {};
  const response = await api.get<{ events: TeamEvent[] }>(`/api/teams/${teamId}/events`, { params });
  return response.data.events;
}

export async function getTeamSharedTree(teamId: string): Promise<FileEntry[]> {
  const response = await api.get<{ entries: FileEntry[] }>(`/api/teams/${teamId}/shared`);
  return response.data.entries;
}

export async function getTeamSharedFile(teamId: string, path: string): Promise<{ content: string; encoding?: 'utf-8' | 'base64' }> {
  const response = await api.get<{ content: string; encoding?: 'utf-8' | 'base64' }>(`/api/teams/${teamId}/shared/file`, {
    params: { path },
  });
  return response.data;
}

export async function getAgentRawLogs(agentId: string): Promise<Array<{ type: string; data: unknown; timestamp: string }>> {
  const response = await api.get<Array<{ type: string; data: unknown; timestamp: string }>>(`/api/agents/${agentId}/logs/raw`);
  return response.data;
}
