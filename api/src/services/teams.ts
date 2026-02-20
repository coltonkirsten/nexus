import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { Team, TeamState, TeamEvent, TeamEventType, TeamEventLog } from '../types.js';
import { getAgent, updateAgent, listAgents } from './agents.js';
import { recreateContainer, getContainerStatus, docker } from './docker.js';
import { getAgentVolumes } from './volumes.js';
import { deleteMailboxForTeam } from './mailbox.js';

// Simple async mutex (same pattern as agents.ts / volumes.ts)
let teamLock: Promise<void> = Promise.resolve();

function withTeamLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = teamLock;
  let resolve: () => void;
  teamLock = new Promise<void>(r => { resolve = r; });
  return release.then(fn).finally(() => resolve!());
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const TEAMS_FILE = path.join(DATA_DIR, 'teams.json');
const EVENTS_DIR = path.join(DATA_DIR, 'team-events');

const MAX_EVENTS = 500;

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(EVENTS_DIR, { recursive: true });
}

async function loadTeamState(): Promise<TeamState> {
  await ensureDirectories();
  try {
    const data = await fs.readFile(TEAMS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { teams: [] };
  }
}

async function saveTeamState(state: TeamState): Promise<void> {
  await ensureDirectories();
  await fs.writeFile(TEAMS_FILE, JSON.stringify(state, null, 2));
}

function getEventsPath(teamId: string): string {
  return path.join(EVENTS_DIR, `${teamId}.json`);
}

async function loadEventLog(teamId: string): Promise<TeamEventLog> {
  await ensureDirectories();
  try {
    const data = await fs.readFile(getEventsPath(teamId), 'utf-8');
    return JSON.parse(data);
  } catch {
    return { teamId, events: [] };
  }
}

async function saveEventLog(log: TeamEventLog): Promise<void> {
  await ensureDirectories();
  await fs.writeFile(getEventsPath(log.teamId), JSON.stringify(log, null, 2));
}

// --- CRUD ---

export async function createTeam(name: string, description?: string): Promise<Team> {
  return withTeamLock(async () => {
    const state = await loadTeamState();
    const id = uuidv4();
    const sharedVolume = `nexus-team-${id}`;

    // Create Docker volume for team shared drive
    await docker.createVolume({ Name: sharedVolume });

    const team: Team = {
      id,
      name,
      description,
      createdAt: new Date().toISOString(),
      sharedVolume,
    };

    state.teams.push(team);
    await saveTeamState(state);
    return team;
  });
}

export async function getTeam(id: string): Promise<Team | null> {
  const state = await loadTeamState();
  return state.teams.find(t => t.id === id) || null;
}

export async function listTeams(): Promise<Team[]> {
  const state = await loadTeamState();
  return state.teams;
}

export async function updateTeam(
  id: string,
  updates: Partial<Pick<Team, 'name' | 'description'>>
): Promise<Team | null> {
  return withTeamLock(async () => {
    const state = await loadTeamState();
    const index = state.teams.findIndex(t => t.id === id);
    if (index === -1) return null;

    if (updates.name !== undefined) state.teams[index].name = updates.name;
    if (updates.description !== undefined) state.teams[index].description = updates.description;

    await saveTeamState(state);
    return state.teams[index];
  });
}

export async function deleteTeam(id: string): Promise<boolean> {
  return withTeamLock(async () => {
    const state = await loadTeamState();
    const index = state.teams.findIndex(t => t.id === id);
    if (index === -1) return false;

    const team = state.teams[index];

    // Check no members
    const members = await getTeamMembers(id);
    if (members.length > 0) {
      throw new Error('Cannot delete a team that has members. Remove all agents first.');
    }

    // Remove Docker volume
    try {
      const volume = docker.getVolume(team.sharedVolume);
      await volume.remove();
    } catch {
      // Best effort — volume might not exist
    }

    // Remove events file
    try {
      await fs.unlink(getEventsPath(id));
    } catch {
      // Events file might not exist
    }

    // Remove mailbox file
    try {
      await deleteMailboxForTeam(id);
    } catch {
      // Mailbox file might not exist
    }

    state.teams.splice(index, 1);
    await saveTeamState(state);
    return true;
  });
}

// --- Membership ---

export async function getTeamMembers(teamId: string): Promise<Array<{ id: string; name: string; status: string; lastActivity?: string }>> {
  const agents = await listAgents();
  return agents
    .filter(a => a.teamId === teamId)
    .map(a => ({ id: a.id, name: a.name, status: a.status, lastActivity: a.lastActivity }));
}

export async function addAgentToTeam(agentId: string, teamId: string): Promise<void> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error('Agent not found');

  const team = await getTeam(teamId);
  if (!team) throw new Error('Team not found');

  // Agent must be stopped
  const status = await getContainerStatus(agentId);
  if (status === 'running' || status === 'starting') {
    throw new Error('Agent must be stopped before joining a team');
  }

  // Agent must not already be in a team
  if (agent.teamId) {
    throw new Error('Agent is already in a team. Remove it from the current team first.');
  }

  // Update agent's teamId
  await updateAgent(agentId, { teamId });

  // Recreate container with team shared volume
  const { ledger, workspace } = await getAgentVolumes(agentId);
  const containerId = await recreateContainer({
    agentId,
    agentName: agent.name,
    port: agent.port!,
    cellType: agent.cellType,
    ledgerVolume: ledger?.dockerVolume,
    workspaceVolume: workspace?.dockerVolume,
    sharedVolume: team.sharedVolume,
    teamId,
  });
  await updateAgent(agentId, { containerId });

  // Emit event
  await emitTeamEvent({
    id: uuidv4(),
    teamId,
    type: 'agent_joined',
    timestamp: new Date().toISOString(),
    agentId,
    agentName: agent.name,
  });
}

export async function removeAgentFromTeam(agentId: string): Promise<void> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error('Agent not found');
  if (!agent.teamId) throw new Error('Agent is not in a team');

  const teamId = agent.teamId;

  // Agent must be stopped
  const status = await getContainerStatus(agentId);
  if (status === 'running' || status === 'starting') {
    throw new Error('Agent must be stopped before leaving a team');
  }

  // Clear teamId
  await updateAgent(agentId, { teamId: undefined });

  // Recreate container without shared volume
  const { ledger, workspace } = await getAgentVolumes(agentId);
  const containerId = await recreateContainer({
    agentId,
    agentName: agent.name,
    port: agent.port!,
    cellType: agent.cellType,
    ledgerVolume: ledger?.dockerVolume,
    workspaceVolume: workspace?.dockerVolume,
  });
  await updateAgent(agentId, { containerId });

  // Emit event
  await emitTeamEvent({
    id: uuidv4(),
    teamId,
    type: 'agent_left',
    timestamp: new Date().toISOString(),
    agentId,
    agentName: agent.name,
  });
}

// --- Events ---

export async function emitTeamEvent(event: TeamEvent): Promise<void> {
  const log = await loadEventLog(event.teamId);
  log.events.push(event);

  // Trim to max events
  if (log.events.length > MAX_EVENTS) {
    log.events = log.events.slice(log.events.length - MAX_EVENTS);
  }

  await saveEventLog(log);
}

export async function getTeamEvents(teamId: string, limit?: number): Promise<TeamEvent[]> {
  const log = await loadEventLog(teamId);
  if (limit && limit > 0) {
    return log.events.slice(-limit);
  }
  return log.events;
}
