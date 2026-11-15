import assert from 'node:assert/strict';
import { afterEach, beforeEach, it } from 'node:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  PathnameContext,
  PathParamsContext,
} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { createTestDom } from '../../../test/dom';
import { teams, workspaces, workspaceDetails } from '../../../test/workspaces';
import teamMessages from '../../../messages/en/teams.json';
import common from '../../../messages/en/common.json';
import sections from '../../../messages/en/sections.json';
import { qk } from '@/services/queryKeys';
import type { Team } from '@/lib/api/endpoints/teams';
import type { WorkspaceSummary } from '@/lib/api/endpoints/workspaces';

let root: Root;
let browser: ReturnType<typeof createTestDom>;
let client: QueryClient;
let availableTeams: Team[];
let availableWorkspaces: WorkspaceSummary[];
let posted: { name: string; slug: string; workspaceId: number }[];
let navigations: string[];
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

async function render(workspaceId = 2, guarded = false, deletion = false) {
  const { default: ManageTeamsLayout } = await import('./ManageTeamsLayout');
  const { default: WorkspaceLayout } = await import('./WorkspaceLayout');
  const { default: WorkspaceDeleteSection } =
    await import('./components/workspace/WorkspaceDeleteSection');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  const content = <main>Workspace content</main>;
  let children = content;
  if (guarded) children = <WorkspaceLayout>{content}</WorkspaceLayout>;
  if (deletion) children = <WorkspaceDeleteSection workspace={workspaceDetails[0]!} />;
  await act(async () =>
    root.render(
      <AppRouterContext.Provider
        value={
          {
            push: (path: string) => navigations.push(path),
            replace: (path: string) => navigations.push(path),
            refresh() {},
            back() {},
            forward() {},
            prefetch() {},
          } as never
        }
      >
        <PathnameContext.Provider value={`/workspaces/${workspaceId}/info`}>
          <PathParamsContext.Provider value={{ workspaceId: String(workspaceId) }}>
            <NextIntlClientProvider
              locale="en"
              timeZone="UTC"
              messages={{ teams: teamMessages, common, sections }}
            >
              <QueryClientProvider client={client}>
                <TooltipProvider>
                  <ManageTeamsLayout>{children}</ManageTeamsLayout>
                </TooltipProvider>
              </QueryClientProvider>
            </NextIntlClientProvider>
          </PathParamsContext.Provider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>,
    ),
  );
  await settle();
}

beforeEach(async () => {
  browser = createTestDom();
  availableTeams = [...teams];
  availableWorkspaces = [...workspaces];
  posted = [];
  navigations = [];
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (input: string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/teams' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        posted.push(body);
        const created = {
          ...teams[0]!,
          id: 30,
          name: body.name,
          slug: body.slug,
          ref: body.slug,
          workspaceId: body.workspaceId,
          projectCount: 0,
        };
        availableTeams.push(created);
        return Response.json(created, { status: 201 });
      }
      if (url.pathname === '/teams') return Response.json(availableTeams);
      if (url.pathname === '/workspaces') return Response.json(availableWorkspaces);
      if (url.pathname === '/workspaces/creation')
        return Response.json({ allowed: true, reason: null });
      if (init?.method === 'DELETE' && url.pathname === '/workspaces/1') {
        availableWorkspaces = availableWorkspaces.filter((workspace) => workspace.id !== 1);
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(qk.workspaces, availableWorkspaces);
  client.setQueryData(qk.teams, availableTeams);
  for (const detail of workspaceDetails) client.setQueryData(qk.workspace(detail.id), detail);
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.querySelector('#root')!);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  browser.restore();
});

it('uses the workspace named by the route when another workspace sorts first', async () => {
  await render(2);
  assert.ok(document.querySelector('a[href="/team-2/settings"]'));
  assert.equal(document.querySelector('a[href="/team-1/settings"]'), null);
  assert.ok(document.querySelector('a[href="/workspaces/2/info"]'));
});

it('creates the first team in the selected empty workspace', async () => {
  await render(3);
  assert.ok(document.querySelector('a[aria-label="Empty"]'));
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${teamMessages.manage.newTeam}"]`,
  )!;
  await act(async () => button.click());
  const input = document.querySelector<HTMLInputElement>(
    `input[placeholder="${teamMessages.create.namePlaceholder}"]`,
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'My team',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const submit = [...document.querySelectorAll('button')].find(
    (entry) => entry.textContent === teamMessages.create.submit,
  )!;
  await act(async () => submit.click());
  assert.deepEqual(posted, [{ name: 'My team', slug: 'my-team', workspaceId: 3 }]);
  assert.deepEqual(navigations, ['/my-team/settings']);
});

it('redirects a workspace member to their team without opening workspace settings', async () => {
  availableWorkspaces = availableWorkspaces.map((workspace) =>
    workspace.id === 3 ? { ...workspace, role: null, canCreateTeam: false } : workspace,
  );
  availableTeams.push({
    ...teams[0]!,
    id: 30,
    workspaceId: 3,
    name: 'Member team',
    slug: 'member-team',
    ref: 'member-team',
    role: 'member',
  });
  client.setQueryData(qk.workspaces, availableWorkspaces);
  client.setQueryData(qk.teams, availableTeams);
  await render(3, true);
  assert.deepEqual(navigations, ['/member-team/settings']);
  assert.equal(document.querySelector('main'), null);
  assert.equal(document.querySelector('a[href="/workspaces/3/info"]'), null);
});

it('removes a deleted workspace from the rail while another remains accessible', async () => {
  await render(1, false, true);
  const action = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === teamMessages.workspace.delete.action,
  )!;
  await act(async () => action.click());
  const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (button) => button.textContent === teamMessages.workspace.delete.action,
  )!;
  await act(async () => confirm.click());
  await settle();
  assert.equal(document.querySelector('a[aria-label="Alpha"]'), null);
  assert.ok(document.querySelector('a[aria-label="Beta"]'));
  assert.deepEqual(navigations, ['/account/teams']);
});
