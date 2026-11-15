import assert from 'node:assert/strict';
import { afterEach, beforeEach, it } from 'node:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestDom } from '../../../../test/dom';
import { useUpdateInstanceAuthSettings } from './god.service';
import { qk } from '@/services/queryKeys';
import type { InstanceAuthSettings } from '@/lib/api/endpoints/god';

let root: Root;
let browser: ReturnType<typeof createTestDom>;
let client: QueryClient;
let update: ReturnType<typeof useUpdateInstanceAuthSettings>;
const settings: InstanceAuthSettings = {
  registration: 'open',
  requireEmailVerification: false,
  magicLink: false,
  emailPassword: true,
  trustProviderEmails: false,
  personalWorkspaces: false,
  inviteTtlDays: 7,
  inviteSearch: false,
  allowedEmailDomains: [],
  hasEmailProvider: false,
  hasSsoProvider: false,
};

function Harness() {
  update = useUpdateInstanceAuthSettings();
  return null;
}

beforeEach(async () => {
  browser = createTestDom();
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => Response.json(settings),
  });
  client = new QueryClient();
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

it('invalidates workspace creation availability after the instance policy changes', async () => {
  client.setQueryData(['workspaceCreation'], { allowed: true, reason: null });
  await act(async () => {
    await update.mutateAsync({ personalWorkspaces: false });
  });
  assert.equal(client.getQueryState(['workspaceCreation'])?.isInvalidated, true);
  assert.deepEqual(client.getQueryData(qk.instanceAuthSettings), settings);
});
