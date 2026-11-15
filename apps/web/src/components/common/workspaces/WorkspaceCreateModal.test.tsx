import assert from 'node:assert/strict';
import { afterEach, beforeEach, it } from 'node:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { createTestDom } from '../../../../test/dom';
import teams from '../../../../messages/en/teams.json';
import common from '../../../../messages/en/common.json';
import type { Workspace } from '@/lib/api/endpoints/workspaces';

let root: Root;
let browser: ReturnType<typeof createTestDom>;
let client: QueryClient;
let requests: string[];
let closed: number;
let results: Workspace[];
let respond: () => Promise<Response>;
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

async function enter(value: string) {
  const input = document.querySelector<HTMLInputElement>('#new-workspace-name')!;
  assert.ok(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}

function submitButton() {
  const button = document.querySelector<HTMLButtonElement>('button[type="submit"]');
  assert.ok(button);
  return button;
}

beforeEach(async () => {
  browser = createTestDom();
  requests = [];
  closed = 0;
  results = [];
  respond = async () => Response.json(created, { status: 201 });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (_url: string, init?: RequestInit) => {
      requests.push(init!.body as string);
      return respond();
    },
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.querySelector('#root')!);
  const { default: WorkspaceCreateModal } = await import('./WorkspaceCreateModal');
  await act(async () =>
    root.render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ teams, common }}>
        <QueryClientProvider client={client}>
          <WorkspaceCreateModal
            onClose={() => closed++}
            onCreated={(workspace) => results.push(workspace)}
          />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root?.unmount());
  client?.clear();
  browser.restore();
});

it('accepts only a name with normalized length 1 through 60', async () => {
  assert.equal(submitButton().disabled, true);
  for (const value of ['   ', 'a'.repeat(61)]) {
    await enter(value);
    assert.equal(submitButton().disabled, true);
  }
  for (const value of ['a', `  ${'a'.repeat(60)}  `]) {
    await enter(value);
    assert.equal(submitButton().disabled, false);
  }
  assert.equal(requests.length, 0);
});

it('keeps its name label associated with the dialog when workspace settings are open', () => {
  const settingsName = document.createElement('input');
  settingsName.id = 'workspace-name';
  document.body.prepend(settingsName);
  const label = document.querySelector<HTMLLabelElement>('[role="dialog"] label');
  assert.ok(label?.control?.closest('[role="dialog"]'));
});

it('submits a trimmed name and reports the created workspace once', async () => {
  await enter('  Second  ');
  await act(async () => submitButton().click());
  assert.deepEqual(requests, ['{"name":"Second"}']);
  assert.deepEqual(results, [created]);
  assert.equal(closed, 1);
});

it('prevents duplicate submissions while a request is pending', async () => {
  let finish!: (response: Response) => void;
  respond = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await enter('Second');
  await act(async () => {
    submitButton().click();
    submitButton().click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(requests.length, 1);
  assert.equal(submitButton().disabled, true);
  await act(async () => finish(Response.json(created, { status: 201 })));
  assert.deepEqual(results, [created]);
});

it('preserves the name after a policy refusal and allows retry', async () => {
  respond = async () => Response.json({ error: 'Creation is restricted' }, { status: 403 });
  await enter('Second');
  await act(async () => submitButton().click());
  assert.equal(document.querySelector<HTMLInputElement>('#new-workspace-name')!.value, 'Second');
  assert.equal(submitButton().disabled, false);
  assert.equal(closed, 0);
  respond = async () => Response.json(created, { status: 201 });
  await act(async () => submitButton().click());
  assert.equal(requests.length, 2);
  assert.deepEqual(results, [created]);
});

it('cancels without sending a creation request', async () => {
  await enter('Second');
  const cancel = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === common.cancel,
  )!;
  await act(async () => cancel.click());
  assert.equal(closed, 1);
  assert.equal(requests.length, 0);
});

it('closes on Escape without sending a creation request', async () => {
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  assert.equal(closed, 1);
  assert.equal(requests.length, 0);
});

it('submits on Enter and ignores Enter during text composition', async () => {
  const input = await enter('Second');
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
    ),
  );
  assert.equal(requests.length, 0);
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  assert.deepEqual(requests, ['{"name":"Second"}']);
});
