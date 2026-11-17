# Multiple Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task by task. Steps use checkboxes for tracking. Repository instructions prohibit committing or pushing without a user request.

**Goal:** Let an eligible person create and use several workspaces in one self-hosted instance.

**Architecture:** Reuse the workspace schema, creation transaction, resource access guards and
workspace selectors. Add two routes to the existing workspace module and connect them to a
shared creation modal through the CE action. Keep workspace selection in the current routes
and component state.

**Tech stack:** Bun, Elysia, Drizzle, PostgreSQL, better-auth, Next.js, React, TanStack Query,
next-intl and the existing shadcn components.

**Spec:** [GOAL.md](../../../GOAL.md), including AC1–AC12 and its scope boundaries.

**Status:** Complete. All tasks and GOAL.md AC1–AC12 are implemented and verified.
The creation policy follows the user's confirmed choice in `GOAL.md`.

## Global constraints

- Preserve all twelve acceptance criteria in `GOAL.md`.
- Ordinary human users can create workspaces while `personalWorkspaces` is enabled. The
  instance owner can create them with either setting value. Agent bot accounts cannot.
- The self-hosted ownership count default and setter reset default are `0`, meaning unlimited.
  Preserve explicit edition overrides and the existing transaction's user-row lock.
- A creation name contains 1–60 characters after trimming. Repeated names are allowed.
- Create empty workspaces. Teams and projects use their existing flows.
- Preserve the `GET /workspaces` array response and the `@/cloud` export and prop contract.
- Reuse the schema and dependencies. No new environment variable, migration, table or service
  architecture is planned. Preserve account-wide views and personal API key permissions.
- Read the applicable app or package `AGENTS.md` before edits. Use Bun and run commands from
  the repository root. Run database-backed suites sequentially.
- Do not edit `components/ui/`, add independent polling, import a workspace package into web,
  or import a feature into the shared component layer.
- Finish new code with `tidy`, `code-review`, `security-audit`, in that order. Propose a commit
  message. Do not run `git commit` or `git push` without a user request.

## Review focus

1. A padded name whose raw length exceeds 60 still succeeds when its trimmed length is 60;
   empty and overlong normalized names fail. Covered by Task 1.
2. Concurrent requests near an explicit ownership limit cannot exceed it, and an owner insert
   failure cannot leave an orphan workspace. Covered by Task 1.
3. A newly created workspace is available before navigation, and a modal opened inside the
   project picker retains focus and its input. Covered by Tasks 3 and 4.
4. A policy change after a capability read blocks creation and leaves entered text available
   for retry. Covered by Tasks 1, 3 and 4.
5. Equal project keys in different workspaces resolve through their full project references;
   selection and navigation in one tab do not change another tab. Covered by Tasks 2 and 5.

## File responsibilities

All paths below are relative to the repository root. Files marked Create do not exist yet.

| Files                                                                                   | Responsibility                                                                                  |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Modify `apps/api/src/shared/limits.ts`                                                  | Unlimited self-hosted ownership default; preserve override functions.                           |
| Modify `apps/api/src/modules/workspaces/{index,model,service}.ts`                       | Creation and capability routes, schemas, normalized name validation and accurate errors.        |
| Modify `apps/api/src/modules/workspaces/__tests__/integration/workspaces.test.ts`       | Creation, capability, limits, independent settings and lifecycle coverage.                      |
| Modify `apps/api/src/modules/workspaces/__tests__/integration/workspace-access.test.ts` | Workspace grants across several workspaces owned by one person.                                 |
| Modify `apps/api/src/modules/teams/__tests__/integration/workspace.test.ts`             | Team and project placement using explicit workspace IDs.                                        |
| Modify `apps/web/src/lib/api/endpoints/workspaces.ts`                                   | Creation and capability DTOs and HTTP functions.                                                |
| Modify `apps/web/src/services/{queryKeys.ts,workspaces.service.ts}`                     | Shared capability query and creation and deletion cache updates.                                |
| Create `apps/web/src/services/workspaces.service.test.tsx`                              | Verify cache state and requests through the actual hooks.                                       |
| Modify `apps/web/src/features/god/services/god.service.ts`                              | Invalidate creation capability after authentication policy updates.                             |
| Create `apps/web/src/features/god/services/god.service.test.tsx`                        | Verify policy-change invalidation within the god feature.                                       |
| Create `apps/web/src/components/common/workspaces/WorkspaceCreateModal.tsx`             | Name input, submission, pending state and success feedback shared by both action variants.      |
| Create `apps/web/src/components/common/workspaces/WorkspaceCreateModal.test.tsx`        | Form validation, cancellation, failure, retry, Enter and pending behavior.                      |
| Modify `apps/web/src/ce/WorkspaceRailActions.tsx`                                       | Eligible creation, restricted explanation and navigation for the existing tile and row actions. |
| Create `apps/web/src/ce/WorkspaceRailActions.test.tsx`                                  | Both entry points, policy refresh, nested picker overlay and successful navigation.             |
| Modify `apps/web/messages/<locale>/teams.json` for every supported locale               | Matching keys for creation and policy feedback in the existing namespace.                       |
| Create `apps/web/src/components/layout/ProjectSwitcher.test.tsx`                        | Workspace-scoped picker results and empty workspace selection.                                  |
| Create `apps/web/src/features/teams/ManageTeamsLayout.test.tsx`                         | Selected workspace, first-team creation and membership-specific navigation.                     |
| Modify `docs/dev/access-model.md`, `docs/dev/auth.md`, `docs/self-hosting.md`           | Document workspace creation and the existing personal workspace policy.                         |
| Modify `packages/auth/src/index.ts` comment only                                        | Describe automatic provisioning alongside the explicit creation route.                          |

Existing navigation components are verification targets in Task 5. Change their behavior only
where a failing acceptance test demonstrates a necessary correction.

## Task 1: Expose transactional workspace creation

**Files:** API limits, workspace routes, schemas, service and `workspaces.test.ts` from the map.

**Consumes:** `requireUser`, `authContext`, `workspaceCreation(current, executor?)`,
`createOwnWorkspace(current, name): Promise<number>` and `getWorkspace(id, role)`.

**Produces:**

- `POST /workspaces`, body `{ name: string }`, response `201` with `WorkspaceResponse`.
- `GET /workspaces/creation`, response `200` with
  `{ allowed: boolean; reason: 'restricted' | 'limit' | null }`.
- `createWorkspaceBody` and `WorkspaceCreationResponse` schemas in `model.ts`.
- Existing service signatures and ownership override functions remain compatible.

- [x] **1.1 Add failing HTTP tests** for `creates multiple workspaces for one account`:
      create the god account first, then a person with no team; create two additional
      workspaces and assert `status === 201`, three distinct owned IDs, `role === 'owner'`,
      `managerCount === 1`, no teams and readable detail. Verify team creation immediately
      succeeds with a returned workspace ID. Submit another account's owner ID in raw JSON
      and verify it cannot acquire ownership.
- [x] **1.2 Add name boundary tests** with the following assertions. Use `app.handle` for
      malformed JSON shapes the typed client cannot submit. Compare accessible workspace IDs
      before and after each rejected request so automatic personal provisioning is accounted for.

      ```ts
      // Missing name, null, number, '', '   ', 'a'.repeat(61): status === 400.
      // 'a', 'a'.repeat(60), `  ${'a'.repeat(60)}  `: status === 201.
      // Stored and returned name equals input.trim().
      // Two requests with the same valid name return distinct IDs.
      ```

- [x] **1.3 Add policy and capability tests**: enabled ordinary user and god return
      `{ allowed: true, reason: null }`; disabled ordinary user and agent return
      `{ allowed: false, reason: 'restricted' }` and POST returns `403`. God can create with the
      setting disabled. An explicit exhausted count returns reason `limit` and POST `409`.
      Read allowed capability, disable the setting, then verify POST is refused. Confirm both
      new routes use the existing `401` handling for anonymous and deactivated accounts;
      reuse existing auth fixtures rather than duplicating the full permission matrix.
- [x] **1.4 Add transaction tests**: with one remaining slot at an explicit positive limit,
      concurrent HTTP requests have sorted statuses `[201, 409]`. With default `0`, both are
      `201` with different IDs. Call `createOwnWorkspace` with a nonexistent owner fixture so
      its owner insert fails; assert rejection and no additional workspace row. Restore the
      ownership override in `afterEach`, including when a test fails.
- [x] **1.5 Run the focused tests** and confirm failures describe the absent routes or the
      default limit. Run `bun --filter=api run test src/modules/workspaces/__tests__/integration/workspaces.test.ts`.
      Environment: installed dependencies and real test PostgreSQL configured as described in
      `docs/development.md` and `docs/dev/api-tests.md`.
- [x] **1.6 Implement the API**: change both ownership defaults to `0`; add the two routes to
      the existing chained Elysia instance, with the static capability route before the numeric
      detail route. Use `requireUser(user)` and reuse the existing service. Declare create
      responses `201`, `400`, `401`, `403`, `409`, and capability responses `200`, `401` through
      the existing response helpers. Set `set.status = 201` and return
      `getWorkspace(createdId, 'owner')`. Keep the list response unchanged.
- [x] **1.7 Normalize in the service**: the body schema requires a string; `createOwnWorkspace`
      trims it and throws `HttpError(400, ...)` when the result has length outside 1–60, before
      insertion. Avoid rejecting a valid padded name with a raw-string maximum. Retain the
      user-row lock, policy recheck and transaction. Use restriction and limit error text that
      is accurate for bots, policy restrictions and arbitrary ownership limits.
- [x] **1.8 Update conflicting tests and comments**: replace the existing POST-returns-404
      assertion with separate human-success and bot-refusal coverage. Set an explicit limit
      of `1` in the ownership-transfer rejection test, restore it afterwards, and keep its
      existing assertion. Update the route, service and limit comments to describe their final
      behavior. Repeat the focused command; all tests must pass.

**Acceptance:** AC1–AC5 and the API portion of AC12.

## Task 2: Prove access, settings and lifecycle across workspaces

**Files:** The three API test files in the map. Existing service implementations are inspected
if a new regression test fails; keep any necessary correction confined to the relevant rule.

**Consumes:** Task 1 routes, existing team/project routes, manager and invite routes,
`deleteAccount`, and current workspace guards.

**Produces:** API evidence for AC7 and AC9–AC11 using several workspaces owned by one person.

- [x] **2.1 Build fixtures through HTTP**: one ordinary owner with workspaces A and B; one
      team and project in each; an admin of A, a team member of A, and an outsider. Use
      returned IDs for team creation and returned full project refs for project access.
      Existing helpers that select the first owned workspace or first team cannot choose B.
      Give both projects key `APP` and verify their distinct full refs address the right data.
      Prepare A and its memberships before creating B; snapshot A's IDs, memberships and
      project ref, then verify they stay unchanged after creating and using B.
- [x] **2.2 Add boundary assertions**: the owner reaches both projects through workspace
      grants. The admin's grants apply to A only; a member's explicit project membership still
      works. Admin/member/outsider requests to B's workspace detail, PATCH and DELETE return
      `404`; unauthorized `POST /teams` targeting B returns `403`. Membership lists and
      workspace list roles match the existing access model.
- [x] **2.3 Add independent-setting assertions**: PATCH A's name, color, team creation and
      sharing controls; GET B and assert its original values. Verify shared-team IDs from B
      cannot be submitted as A's sharing selection. Retain existing instance sharing policy.
- [x] **2.4 Add lifecycle assertions**: delete empty A while B contains work; B's IDs and data
      remain accessible. Project-containing and agent-containing workspaces each reject
      deletion with `409`. Deleting the last empty workspace preserves the existing automatic
      replacement policy. Repeated planner requests and a sign-in while B is owned add no
      workspace. Include both setting values in the automatic-provisioning checks.
- [x] **2.5 Extend account-deletion tests** with one empty owned workspace and two populated
      owned workspaces. Assert the empty one is deleted, both populated workspaces transfer
      to god under the existing rules, and their teams and projects remain accessible with
      the expected owners. Do not expose a workspace transfer route.
- [x] **2.6 Run and inspect**:
      `bun --filter=api run test src/modules/workspaces/__tests__/integration/ src/modules/teams/__tests__/integration/workspace.test.ts`.
      Tests must pass against real PostgreSQL. For tests of an existing supported behavior,
      keep the test passing without changing that behavior. For any actual correction,
      confirm its regression test fails before the fix and passes after it.

## Task 3: Add web transport and cache behavior

**Files:** Web API functions, query keys, workspace service and its new test file; god service
and its new test file.

**Consumes:** Task 1 HTTP contracts and the existing `Workspace` and `WorkspaceSummary` types.

**Produces:** `WorkspaceCreation` with the capability shape; `getWorkspaceCreation():
Promise<WorkspaceCreation>`; `createWorkspace(input: { name: string }): Promise<Workspace>`;
`useWorkspaceCreationQuery()`; `useCreateWorkspace()` whose mutation input is `{ name: string }`.

- [x] **3.1 Add hook tests** following `services/dashboards.service.test.tsx`: render the actual
      hook with a real `QueryClient` and replace only HTTP `fetch`. Assert creation sends
      `POST /workspaces` with `{ name }`, seeds `qk.workspace(created.id)`, and inserts exactly
      one owner summary with `canCreateTeam: true` in `qk.workspaces` before navigation. Keep
      existing list entries when merging. A failed create leaves detail and list caches intact.
- [x] **3.2 Add freshness tests**: a successful create or delete invalidates creation
      capability. Test policy updates through `useUpdateInstanceAuthSettings` in the god
      service's own test file; its successful mutation invalidates capability too. A capability
      refetch replaces a cached allowed response with a current restricted result.
      Assert capability failures remain failures rather than being interpreted as permission.
- [x] **3.3 Run** `bun --filter=web run test src/services/workspaces.service.test.tsx src/features/god/services/god.service.test.tsx` and
      confirm the new export or missing cache behavior makes the relevant cases fail.
- [x] **3.4 Implement the HTTP functions and hooks** in the mapped files. Add
      `qk.workspaceCreation = ['workspaceCreation'] as const`. Seed detail and merge the
      summary by ID on creation, then invalidate list and capability. Extend deletion's
      existing invalidations with capability. Invalidate capability after a successful god
      authentication settings update. Set capability `staleTime: 0` and
      `refetchOnWindowFocus: true`; the app-wide provider otherwise disables focus refetch.
      Do not add a polling timer or a new cache abstraction.
- [x] **3.5 Repeat the focused test**; assert all cases pass, including the preserved-cache
      failure case. Restore fetch and DOM globals, unmount and clear the client in teardown.

**Acceptance:** Cache and policy parts of AC4, AC6, AC10 and AC11.

## Task 4: Provide creation from both existing actions

**Files:** Shared `WorkspaceCreateModal` and its test, CE `WorkspaceRailActions` and its test,
and `teams.json` in every supported locale.

**Consumes:** Task 3 hooks, `Modal`, `Input`, `Label`, `Button`, existing tile/row classes,
`workspacePath` and the existing global mutation error toast.

**Produces:** `WorkspaceCreateModal({ onClose, onCreated }: { onClose: () => void;
onCreated: (workspace: Workspace) => void })` and the compatible
`WorkspaceRailActions({ variant?: 'tile' | 'row' })` export.

- [x] **4.1 Add form interaction tests** using the existing JSDOM, React `act`, QueryClient,
      next-intl and router-context patterns. Assert whitespace and normalized length 61
      cannot submit, lengths 1 and 60 can, the request name is trimmed, and pending submission
      cannot submit again. A rejection preserves the input and permits retry. Cancel and
      Escape before submission send no POST. Enter submits once, while a composing Enter
      sends no request. A successful response closes the form and invokes `onCreated` once.
- [x] **4.2 Add action interaction tests** for both variants: a fresh allowed capability opens
      the modal, a restricted or limit result shows the corresponding explanation, and a
      failed capability fetch offers retry without opening a form. Seed allowed cache data
      but return restricted data on action refresh; assert the form stays closed. Open the
      row action in a real Popover fixture and type into the modal, then submit: its portal
      and focus handling must not dismiss the form during editing.
- [x] **4.3 Run** `bun --filter=web run test src/components/common/workspaces/WorkspaceCreateModal.test.tsx src/ce/WorkspaceRailActions.test.tsx`.
      Confirm the absent components or behaviors cause the expected failures.
- [x] **4.4 Implement the modal** in the shared component layer. Keep only name state and the
      creation mutation, validate the trimmed length and prevent submission while pending.
      Use an accessible label and the existing overlay. Keep failure input mounted. Use the
      global mutation failure toast and emit one translated success toast, then notify the
      caller. Follow existing IME and `dir="auto"` input behavior.
- [x] **4.5 Implement both CE actions** with the existing props and presentation. Refresh the
      capability when an action is invoked and show a pending state during that read. Mount
      the shared modal for an allowed result; show translated policy or count explanations
      for refused results. On creation, close the modal and navigate to
      `workspacePath(workspace.id, 'info')`. Keep the modal mounted throughout editing within
      the picker. Do not introduce global workspace selection or a new creation provider.
- [x] **4.6 Add messages** under `teams.workspace`: modal title, name label, bounds feedback,
      submit and success text, restricted and limit explanations, and capability-fetch retry.
      Add matching keys in every locale, with English as the source. Keep existing hosted
      message keys where their external use cannot be ruled out. Preserve `@/cloud` exports.
- [x] **4.7 Repeat the focused tests** and verify success and failure feedback each appear
      once. Confirm a policy refusal after the form opened leaves the name available for
      retry and the API rejects the write even with stale UI capability.

**Acceptance:** AC3, AC4 and AC6; keyboard and nested-overlay portions of AC8.

## Task 5: Verify workspace navigation and first-team creation

**Files:** New `ProjectSwitcher.test.tsx` and `ManageTeamsLayout.test.tsx` from the map.
Inspect `components/layout/ProjectSwitcher{,Menu,Nav,List,Recent}.tsx`,
`features/teams/{ManageTeamsLayout,WorkspaceLayout}.tsx` and
`features/teams/components/workspace/{WorkspacesRail,WorkspaceDeleteSection}.tsx`.

**Consumes:** Task 4 actions; existing project search filters, route helpers and team modal.

**Produces:** Navigation evidence for AC6–AC8, AC10 and AC11. Preserve existing route formats.

- [x] **5.1 Add picker tests** with two populated workspaces and an empty owned workspace.
      Select each and assert that search, favorites and recent requests carry the selected
      `workspaceId`. Displayed teams and team-scoped requests must belong to that workspace.
      The empty workspace stays selectable, shows empty results and exposes its settings.
      Reuse the actual query hooks and vary HTTP responses rather than mocking filtering logic.
- [x] **5.2 Add team-layout tests**: route workspace B while A sorts first; assert only B's
      teams render and its creation action submits B's ID. A new empty workspace is shown as
      an owned workspace and allows first-team creation. A role-null workspace opens only an
      accessible team; its workspace settings remain guarded. Deleting A removes it from
      navigation while B remains available.
- [x] **5.3 Run** `bun --filter=web run test src/components/layout/ProjectSwitcher.test.tsx src/features/teams/ManageTeamsLayout.test.tsx`.
      Existing correct behavior may already pass. Fix only demonstrated failures required
      by these assertions, in their owning component or service. Preserve workspace query
      cache keys and current route helpers.
- [x] **5.4 Verify in a browser** using `bun run dev`: create a workspace from each action;
      create a team and project in A and B; select the empty workspace; reload workspace,
      team and full project links; use browser back; delete an empty workspace. Verify two
      open tabs keep independent navigation. Test keyboard focus, Enter, Escape and a
      390-pixel-wide screen. Confirm each workspace's settings and permissions match the API.
      Use available browser tools or manual review; do not add a browser framework dependency.

## Task 6: Document and verify the complete feature

**Files:** The three documentation files in the map, the provisioning comment in
`packages/auth/src/index.ts`, and the acceptance checkboxes in `GOAL.md`.

**Consumes:** Tasks 1–5 and their test results. **Produces:** A reviewed implementation and
requirement-by-requirement evidence for AC1–AC12.

- [x] **6.1 Update the access and auth docs** with POST creation, capability, policy, unlimited
      default, explicit overrides and automatic personal provisioning only when no owned
      workspace exists. Add self-hosting instructions for creation, team/project setup and
      switching. Read `packages/auth/AGENTS.md` before updating the stale provisioning comment;
      keep auth behavior and plugins unchanged.
- [x] **6.2 Run `tidy`, `code-review`, then focused `security-audit`** on new code, in that order.
      Check the authenticated owner derivation, bot refusal, server policy recheck, transaction,
      cross-workspace access, cache scope and existing CSRF guard. Address material findings
      within the goal's scope. Keep the security review read-only unless applying a separate
      verified fix; use its guidance workflow, without creating a full audit report.
- [x] **6.3 Run required checks sequentially from the root**: `bun run typecheck`,
      `bun run lint`, `bun run format:check`, `bun run test`. Expected: exit code `0` for each.
      Inspect all output and record any blocker. Do not mark AC12 complete for an unavailable
      environment or an unrun check. Repeat affected checks after review fixes.
- [x] **6.4 Verify the standard build** with `bun --filter=web run build` and the existing
      Docker gate from `docs/development.md`: `docker compose -f docker-compose.test.yml build`,
      then `docker compose -f docker-compose.test.yml run --rm api-test`. Confirm the normal
      CE build resolves `WorkspaceRailActions` and exposes creation with no cloud entry or
      added configuration. Do not create another CI workflow.
- [x] **6.5 Audit acceptance individually** using the matrix below. Record the exact passing
      command, test name or browser observation beside each criterion in `GOAL.md` before
      checking it. Verify the final diff introduces no schema or deployment changes and keeps
      existing IDs, memberships, list shapes and URL formats. Keep any unproven item unchecked.
- [x] **6.6 Propose a commit message** such as `feat: support multiple self-hosted workspaces`.
      Do not commit or push without a user request.

## Acceptance coverage

| Criterion | Implementation and authoritative verification                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| AC1       | Task 1: ordinary account owns at least three workspaces under default settings.                             |
| AC2       | Task 1: HTTP create/detail/team requests and owner assignment assertions.                                   |
| AC3       | Tasks 1 and 4: normalized input boundaries and repeated-name API tests.                                     |
| AC4       | Tasks 1, 3 and 4: policy matrix, bots, auth guard, freshness and stale UI refusal.                          |
| AC5       | Task 1: concurrency at a positive limit, unlimited concurrency and transaction rollback.                    |
| AC6       | Tasks 3–5: actual hook cache state, both actions, modal success/failure/cancel and browser navigation.      |
| AC7       | Tasks 2 and 5: explicit team/project placement and empty workspace's first team.                            |
| AC8       | Tasks 4 and 5: picker filter requests, nested focus, direct links, reload, back, tabs, keyboard and mobile. |
| AC9       | Task 2: resource access and role assertions across two workspaces with the same owner.                      |
| AC10      | Tasks 2, 3 and 5: independent settings, workspace IDs in caches and displayed permissions.                  |
| AC11      | Tasks 2, 3 and 5: deletion, navigation cleanup, fallback provisioning and account removal.                  |
| AC12      | Task 6: docs, edition contracts, translation lint, full checks, existing-data fixtures and standard builds. |

Acceptance evidence and final check results are recorded in [GOAL.md](../../../GOAL.md).
The full root suite passes 4,065 tests. Typecheck, lint, formatting, the production web build
and Docker build and integration gates pass. The code and security reviews have no confirmed
findings. No commit or push is authorized.
