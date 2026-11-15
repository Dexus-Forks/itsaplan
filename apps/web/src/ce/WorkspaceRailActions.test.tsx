import assert from 'node:assert/strict';
import { afterEach, beforeEach, it } from 'node:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { createTestDom } from '../../test/dom';
import teams from '../../messages/en/teams.json';
import common from '../../messages/en/common.json';
import { qk } from '@/services/queryKeys';
import type { Workspace, WorkspaceCreation } from '@/lib/api/endpoints/workspaces';

let root: Root;
let browser: ReturnType<typeof createTestDom>;
let client: QueryClient;
let availability: WorkspaceCreation;
let failRead: boolean;
let paths: string[];
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

async function render(variant: 'tile' | 'row' = 'tile', nested = false) {
  const { default: WorkspaceRailActions } = await import('./WorkspaceRailActions');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  const { Popover, PopoverContent, PopoverTrigger } = await import('@/components/ui/popover');
  const action = <WorkspaceRailActions variant={variant} />;
  await act(async () =>
    root.render(
      <AppRouterContext.Provider
        value={
          {
            push: (path: string) => paths.push(path),
            replace() {},
            refresh() {},
            back() {},
            forward() {},
            prefetch() {},
          } as never
        }
      >
        <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ teams, common }}>
          <QueryClientProvider client={client}>
            <TooltipProvider>
              {nested ? (
                <Popover defaultOpen>
                  <PopoverTrigger asChild>
                    <button>Projects</button>
                  </PopoverTrigger>
                  <PopoverContent>{action}</PopoverContent>
                </Popover>
              ) : (
                action
              )}
            </TooltipProvider>
          </QueryClientProvider>
        </NextIntlClientProvider>
      </AppRouterContext.Provider>,
    ),
  );
}

async function openCreation() {
  const trigger = [...document.querySelectorAll('button')].find(
    (button) =>
      button.textContent?.trim() === teams.workspace.create ||
      button.getAttribute('aria-label') === teams.workspace.create,
  );
  assert.ok(trigger);
  await act(async () => trigger.click());
}

beforeEach(async () => {
  browser = createTestDom();
  availability = { allowed: true, reason: null };
  failRead = false;
  paths = [];
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Response.json(created, { status: 201 });
      if (failRead) return Response.json({ error: 'Unavailable' }, { status: 503 });
      return Response.json(availability);
    },
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.querySelector('#root')!);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  browser.restore();
});

for (const variant of ['tile', 'row'] as const) {
  it(`opens workspace creation from the ${variant} action`, async () => {
    await render(variant);
    await openCreation();
    assert.ok(document.querySelector('#new-workspace-name'));
  });
}

it('refreshes cached capability before opening the creation form', async () => {
  client.setQueryData(qk.workspaceCreation, { allowed: true, reason: null });
  availability = { allowed: false, reason: 'restricted' };
  await render();
  await openCreation();
  assert.equal(document.querySelector('#new-workspace-name'), null);
  assert.match(document.body.textContent!, /instance owner/);
});

it('explains an ownership limit without offering creation', async () => {
  availability = { allowed: false, reason: 'limit' };
  await render('row');
  await openCreation();
  assert.equal(document.querySelector('#new-workspace-name'), null);
  assert.match(document.body.textContent!, /workspace limit/);
});

it('offers retry after a failed capability read', async () => {
  failRead = true;
  await render();
  await openCreation();
  assert.equal(document.querySelector('#new-workspace-name'), null);
  assert.ok(document.querySelector('[role="alert"]'));
  failRead = false;
  const retry = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Try again',
  )!;
  await act(async () => retry.click());
  assert.ok(document.querySelector('#new-workspace-name'));
});

it('keeps a form opened inside the picker usable and navigates after creation', async () => {
  await render('row', true);
  await openCreation();
  const input = document.querySelector<HTMLInputElement>('#new-workspace-name');
  assert.ok(input);
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'Second',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(document.activeElement, input);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(),
  );
  assert.deepEqual(paths, ['/workspaces/8/info']);
  assert.equal(document.querySelector('#new-workspace-name'), null);
  assert.deepEqual(client.getQueryData(qk.workspace(8)), created);
});
