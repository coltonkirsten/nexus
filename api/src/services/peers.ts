import { listAgents } from './agents.js';

/**
 * Broadcast team-scoped peer lists to all running agents.
 * - Agents in a team only see their team members.
 * - Agents not in a team receive an empty peer list.
 */
export async function broadcastPeers(): Promise<void> {
  const agents = await listAgents();

  // Group agents by teamId
  const teamGroups = new Map<string, typeof agents>();
  for (const agent of agents) {
    if (agent.teamId) {
      const group = teamGroups.get(agent.teamId) || [];
      group.push(agent);
      teamGroups.set(agent.teamId, group);
    }
  }

  const broadcasts = agents
    .filter((a) => a.status === 'running' && a.port)
    .map(async (a) => {
      // Build peer list: team members only, or empty if no team
      let peerList: Array<{ id: string; name: string; status: string }> = [];
      if (a.teamId) {
        const teamMembers = teamGroups.get(a.teamId) || [];
        peerList = teamMembers.map((m) => ({
          id: m.id,
          name: m.name,
          status: m.status,
        }));
      }

      try {
        await fetch(`http://localhost:${a.port}/peers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peers: peerList }),
        });
      } catch {
        // Fire-and-forget — agent might not be reachable yet
      }
    });

  await Promise.all(broadcasts);
}
