import axios from 'axios';
import type { Volume, VolumeType } from '../types/agent';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function listVolumes(type?: VolumeType): Promise<Volume[]> {
  const params = type ? { type } : {};
  const response = await api.get<{ volumes: Volume[] }>('/api/volumes', { params });
  return response.data.volumes;
}

export async function getVolume(id: string): Promise<Volume> {
  const response = await api.get<{ volume: Volume }>(`/api/volumes/${id}`);
  return response.data.volume;
}

export async function createVolume(data: {
  name: string;
  type: VolumeType;
  template?: string;
  description?: string;
}): Promise<Volume> {
  const response = await api.post<{ volume: Volume }>('/api/volumes', data);
  return response.data.volume;
}

export async function updateVolume(id: string, data: { name?: string; description?: string }): Promise<Volume> {
  const response = await api.patch<{ volume: Volume }>(`/api/volumes/${id}`, data);
  return response.data.volume;
}

export async function deleteVolume(id: string): Promise<void> {
  await api.delete(`/api/volumes/${id}`);
}

export async function cloneVolume(id: string, name: string, description?: string): Promise<Volume> {
  const response = await api.post<{ volume: Volume }>(`/api/volumes/${id}/clone`, { name, description });
  return response.data.volume;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
}

export async function getVolumeTree(id: string, path?: string): Promise<FileEntry[]> {
  const params = path ? { path } : {};
  const response = await api.get<{ entries: FileEntry[] }>(`/api/volumes/${id}/tree`, { params });
  return response.data.entries;
}

export async function getVolumeFile(id: string, path: string): Promise<{ content: string; encoding?: string }> {
  const response = await api.get<{ content: string; encoding?: string }>(`/api/volumes/${id}/file`, {
    params: { path },
  });
  return response.data;
}

export async function attachVolume(agentId: string, volumeId: string): Promise<void> {
  await api.post(`/api/agents/${agentId}/attach`, { volumeId });
}

export async function detachVolume(agentId: string, slot: 'ledger' | 'workspace'): Promise<void> {
  await api.post(`/api/agents/${agentId}/detach`, { slot });
}
