import assert from 'node:assert/strict';
import { afterEach, beforeEach, it } from 'node:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestDom } from '../../test/dom';
import {
  useCreateWorkspace,
  useDeleteWorkspace,
  useWorkspaceCreationQuery,
} from './workspaces.service';
import { qk } from './queryKeys';
import type {
  Workspace,
  WorkspaceCreation,
  WorkspaceSummary,
} from '@/lib/api/endpoints/workspaces';

let root: Root;
let browser: ReturnType<typeof createTestDom>;
let client: QueryClient;
let create: ReturnType<typeof useCreateWorkspace>;
let remove: ReturnType<typeof useDeleteWorkspace>;
let capability: ReturnType<typeof useWorkspaceCreationQuery>;
let availability: WorkspaceCreation;
let failCreate: boolean;
let sent: { path: string; method: string; body?: string }[];

const created: Workspace = {
  id: 8,
  name: 'Second',
  role: 'owner',
  managerCount: 1,
  color: null,
  teamCreation: 'owner',
  maxConcurrentRuns: 0,
  maxConcurrentRunsCap: 0,
  sharingAvailable: true,
  sharingEnabled: true,
  sharingTeamsOnly: false,
  sharingTeams: [],
  deletion: 'allowed',
};
const summary: WorkspaceSummary = {
  id: 8,
  name: 'Second',
  role: 'owner',
  color: null,
  canCreateTeam: true,
};

function Harness() {
  create = useCreateWorkspace();
  remove = useDeleteWorkspace(created.id);
  capability = useWorkspaceCreationQuery();
  return null;
}

beforeEach(async () => {
  browser = createTestDom();
  availability = { allowed: true, reason: null };
  failCreate = false;
  sent = [];
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? 'GET';
      sent.push({ path, method, body: init?.body as string | undefined });
      if (path === '/workspaces/creation') return Response.json(availability);
      if (method === 'DELETE') return new Response(null, { status: 204 });
      if (failCreate) return Response.json({ error: 'Creation is restricted' }, { status: 403 });
      return Response.json(created, { status: 201 });
    },
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.querySelector('#root')!);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  browser.restore();
});

it('makes a created workspace available before navigation and preserves the current list', async () => {
  const previous = { ...summary, id: 7, name: 'First' };
  client.setQueryData(qk.workspaces, [previous]);
  await act(async () => {
    await create.mutateAsync({ name: 'Second' });
  });
  assert.deepEqual(client.getQueryData(qk.workspace(8)), created);
  assert.deepEqual(client.getQueryData(qk.workspaces), [previous, summary]);
  assert.deepEqual(
    sent.find((request) => request.method === 'POST'),
    {
      path: '/workspaces',
      method: 'POST',
      body: '{"name":"Second"}',
    },
  );
});

it('retains only one summary when a created workspace is already cached', async () => {
  client.setQueryData(qk.workspaces, [summary]);
  await act(async () => {
    await create.mutateAsync({ name: 'Second' });
  });
  assert.deepEqual(client.getQueryData(qk.workspaces), [summary]);
});

it('keeps workspace caches unchanged after a failed creation', async () => {
  const previous = { ...summary, id: 7, name: 'First' };
  client.setQueryData(qk.workspaces, [previous]);
  failCreate = true;
  await act(async () => {
    await assert.rejects(create.mutateAsync({ name: 'Second' }), /Creation is restricted/);
  });
  assert.deepEqual(client.getQueryData(qk.workspaces), [previous]);
  assert.equal(client.getQueryData(qk.workspace(8)), undefined);
});

it('refreshes creation availability after creating a workspace', async () => {
  availability = { allowed: false, reason: 'limit' };
  await act(async () => {
    await create.mutateAsync({ name: 'Second' });
  });
  assert.deepEqual(client.getQueryData(qk.workspaceCreation), { allowed: false, reason: 'limit' });
});

it('refreshes creation availability after deleting a workspace', async () => {
  client.setQueryData(qk.workspaceCreation, { allowed: false, reason: 'limit' });
  await act(async () => {
    await remove.mutateAsync();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.deepEqual(client.getQueryData(qk.workspaceCreation), { allowed: true, reason: null });
});

it('refetches a stale capability and exposes a failed read as an error', async () => {
  availability = { allowed: false, reason: 'restricted' };
  await act(async () => {
    const result = await capability.refetch();
    assert.deepEqual(result.data, { allowed: false, reason: 'restricted' });
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => Response.json({ error: 'Unavailable' }, { status: 503 }),
  });
  await act(async () => {
    const result = await capability.refetch();
    assert.equal(result.isError, true);
  });
});
