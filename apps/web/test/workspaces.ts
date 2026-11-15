import type { Workspace, WorkspaceSummary } from '../src/lib/api/endpoints/workspaces';
import type { Team } from '../src/lib/api/endpoints/teams';

export const workspaces: WorkspaceSummary[] = [
  { id: 1, name: 'Alpha', role: 'owner', color: null, canCreateTeam: true },
  { id: 2, name: 'Beta', role: 'owner', color: null, canCreateTeam: true },
  { id: 3, name: 'Empty', role: 'owner', color: null, canCreateTeam: true },
];

export const workspaceDetails: Workspace[] = workspaces.map((entry) => ({
  id: entry.id,
  name: entry.name,
  color: null,
  role: 'owner',
  managerCount: 1,
  teamCreation: 'owner',
  maxConcurrentRuns: 0,
  maxConcurrentRunsCap: 0,
  sharingAvailable: true,
  sharingEnabled: true,
  sharingTeamsOnly: false,
  sharingTeams: [],
  deletion: 'allowed',
}));

export const teams: Team[] = [1, 2].map((id) => ({
  id: id * 10,
  workspaceId: id,
  name: `${id === 1 ? 'Alpha' : 'Beta'} team`,
  slug: `team-${id}`,
  ref: `team-${id}`,
  mcpEnabled: true,
  role: 'owner',
  via: 'member',
  source: 'invite',
  joinedAt: '2026-11-12T00:00:00.000Z',
  projectCount: 1,
  memberCount: 1,
  ownerCount: 1,
  roleCount: 1,
  integrationCount: 0,
  agentCount: 0,
  skillCount: 0,
  toolCount: 0,
  createdAt: '2026-11-12T00:00:00.000Z',
}));
