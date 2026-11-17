# Goal: Multiple workspaces on a self-hosted instance

Status: Complete. All twelve acceptance criteria verified on 2026-11-12.

Implementation plan: [Multiple workspaces](docs/superpowers/plans/2026-11-12-multiple-workspaces.md).

## Outcome

A person can create and own several workspaces in one self-hosted It's a Plan instance,
using one account. Each workspace can contain its own teams and projects, settings and
administrators. The person can create workspaces and switch between them through the web UI.

Creation follows the existing `personalWorkspaces` policy: ordinary users can create additional
workspaces while it is enabled. The instance owner can create them with either setting value.
Agent bot accounts cannot create workspaces. The self-hosted ownership count default
is unlimited.

Projects already support grouping within a workspace. Additional workspaces provide separate
administration and workspace settings when projects need them.

## Implementation

| Area | Behavior |
| ---- | -------- |
| Database | The existing workspace, manager, team and project relationships support several workspaces per owner. No migration is required. |
| Ownership limit | The self-hosted default and setter reset value are `0` (unlimited). Explicit edition overrides remain available. |
| Creation service | The existing user-row lock protects the policy and ownership-limit check, workspace insert and owner insert in one transaction. Names are trimmed and validated at 1–60 characters. |
| API | `POST /workspaces` returns the caller's new empty workspace with status `201`. `GET /workspaces/creation` returns `{ allowed, reason }`. The existing list response remains an array. |
| Web UI | Both CE action variants open the shared creation modal. Capability is refreshed on opening. Successful creation updates workspace caches before navigation to settings. |
| Navigation | The workspace rail, project switcher and team management routes support populated and empty workspaces. Selection follows the existing routes and component state. |
| Personal workspace | `ensurePersonalWorkspace` provisions only when an eligible person owns none, using the same user-row lock. |
| Access and lifecycle | Existing resource guards, project and agent deletion checks, and account-removal rules apply independently to every workspace. Integration tests cover several workspaces with the same owner. |

Source locations:

- [Database schema](packages/db/src/schema/app.ts) and [workspace insertion](packages/db/src/workspace.ts).
- [Ownership limits](apps/api/src/shared/limits.ts).
- [Workspace services](apps/api/src/modules/workspaces/service.ts), especially
  `workspaceCreation`, `createOwnWorkspace`, `listWorkspaces` and `deleteWorkspace`.
- [Workspace routes](apps/api/src/modules/workspaces/index.ts) and
  [request and response schemas](apps/api/src/modules/workspaces/model.ts).
- [Creation service tests](apps/api/src/modules/workspaces/__tests__/integration/workspaces.test.ts)
  and [workspace access tests](apps/api/src/modules/workspaces/__tests__/integration/workspace-access.test.ts).
- [CE workspace action](apps/web/src/ce/WorkspaceRailActions.tsx),
  [workspace rail](apps/web/src/features/teams/components/workspace/WorkspacesRail.tsx),
  [project switcher](apps/web/src/components/layout/ProjectSwitcher.tsx) and
  [team management layout](apps/web/src/features/teams/ManageTeamsLayout.tsx).
- [Web API functions](apps/web/src/lib/api/endpoints/workspaces.ts) and
  [query hooks](apps/web/src/services/workspaces.service.ts).
- [Personal workspace provisioning](packages/auth/src/index.ts),
  [access model](docs/dev/access-model.md) and [authentication behavior](docs/dev/auth.md).

## Research and approach

Extend the existing workspace model and creation service. This is the recommended approach
because the database relationships, access rules and workspace selectors already support
multiple workspaces.

The alternatives considered are:

- **Add a configurable ownership limit.** This supports instance-specific quotas, but adds
  configuration and UI work beyond the requested ability to use several workspaces. Keep the
  existing programmatic override; an administrator-facing limit is outside this goal.
- **Adopt Better Auth organizations.** The plugin supplies organization creation policy,
  membership and limits, and requires schema additions. Adopting it here would also require
  reconciling those concepts with the application's workspace and team access model. That
  replacement is outside this goal. See the official
  [Better Auth organization documentation](https://better-auth.com/docs/plugins/organization).

The implementation should retain these established practices:

- **Transactional creation.** PostgreSQL holds `FOR UPDATE` row locks until transaction end.
  Keep the user-row lock around the limit check and creation, including when an edition sets
  a positive limit. See [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).
- **Authorization on every request.** Workspace selection in the browser does not grant access.
  Check the caller's rights to the requested resource through the existing guards. See
  [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
- **Query invalidation after creation.** Update or invalidate affected workspace queries after
  a successful mutation so selectors and settings show the result. This matches the existing
  hooks and [TanStack Query mutation guidance](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations).

The recommendation to reuse the application model is based on the repository findings above.
The external sources support the relevant library and database behavior.

## Implementation scope

1. Change the self-hosted ownership count default in `shared/limits.ts`. Update tests that
   depend on the default of one to set a positive limit explicitly and restore the new default.
2. Add `POST /workspaces` in the existing workspace module. Accept a name, derive the owner
   from the authenticated caller, call `createOwnWorkspace`, and return `201` with the existing
   workspace detail DTO. Create an empty workspace; teams and projects use their existing flows.
   Trim the name and validate a length of 1–60 characters after trimming. Distinct workspace
   IDs allow repeated names.
3. Expose `{ allowed, reason }` from `workspaceCreation` through an authenticated capability
   endpoint, `GET /workspaces/creation`. Preserve the array
   returned by `GET /workspaces`. Recheck policy during every creation request.
4. Add the web API function, capability query and creation mutation. Replace the CE upgrade
   prompt with a shared creation dialog available from both action variants. Navigate to the
   new workspace's settings after success. Show restricted users a clear explanation.
5. Verify the workspace rail, project switcher and team creation flow with several owned
   workspaces. Scope selection and cached lists correctly. Follow existing translation,
   toast, component and query conventions. Keep the `@/cloud` export contract compatible.
6. Add focused integration and UI coverage. Update `docs/dev/access-model.md`,
   `docs/dev/auth.md` and the relevant self-hosting documentation to describe creation and
   the existing personal workspace policy. Update comments that claim self-hosted accounts
   can own only one workspace or that no core route creates one.

## Acceptance criteria

- [x] **AC1 — Several owned workspaces.** With the standard self-hosted build and defaults,
      one ordinary human account can own at least three workspaces. Additional creation
      requires no subscription, hosted service, manual database edit or deployment variable.
- [x] **AC2 — Creation contract.** `POST /workspaces` returns `201` and the new workspace's
      detail DTO with the caller's role set to `owner`. The workspace has no teams or projects.
      The caller can immediately read its settings and create a team in it. A submitted
      owner ID cannot assign ownership to another account.
- [x] **AC3 — Input validation.** Missing, non-string, empty, whitespace-only and names longer
      than 60 characters after trimming are rejected with a validation response and create no
      workspace. Trimmed names of lengths 1 and 60 succeed. Repeated names are accepted as
      separate workspaces with distinct IDs.
- [x] **AC4 — Creation policy.** With `personalWorkspaces` enabled, ordinary human accounts
      and the instance owner can create additional workspaces. With it disabled, ordinary
      accounts receive `403` and the instance owner succeeds. Bot accounts receive `403`.
      Anonymous and deactivated accounts receive `401`. The capability response and UI reflect
      the current policy, and a stale UI cannot bypass the server check.
- [x] **AC5 — Atomic creation and limits.** Workspace and owner insertion commit together.
      For concurrent requests by the same account with one remaining slot under an explicit
      positive ownership limit, exactly one succeeds and the other receives `409`. With the
      unlimited default, two valid concurrent requests create two complete workspaces.
      Error text describes an ownership limit without assuming the limit is one.
- [x] **AC6 — Creation UI.** Both the workspace rail's tile action and project switcher's row
      action open the creation form for eligible users. A successful submit makes the workspace
      visible in both selectors and opens its settings without a page reload. Duplicate submits
      are prevented while pending. Failure displays feedback and keeps the entered name for
      retry. Cancellation creates nothing. Restricted users see a policy explanation.
- [x] **AC7 — Teams and projects.** The same owner creates a team and a project in each of
      two workspaces through existing UI flows. Each team is attached to the workspace selected
      during creation. Each project appears under its team's workspace. Empty workspaces remain
      selectable and provide a usable route to create their first team.
- [x] **AC8 — Switching and state.** Switching between two populated workspaces and one empty
      workspace shows the selected workspace's teams and projects. Favorites and recent project
      results in the picker respect its selected workspace. Direct links, reloads and browser
      back navigation resolve the workspace from the existing routes. Switching in one tab
      does not redirect another tab. Keyboard and narrow-screen creation flows are usable.
- [x] **AC9 — Access boundaries.** A person who is an admin or team member only in workspace A
      gains no access to workspace B through that role. Unauthorized detail, update and delete
      requests to B follow the existing guards. Creating a team in an unauthorized workspace is
      refused. Workspace owners retain access to all projects in each workspace they own.
      Existing project membership grants continue to work.
- [x] **AC10 — Independent settings.** Renaming, recoloring, changing team creation policy or
      changing sharing settings in A leaves B's settings unchanged. Lists and cached settings
      use the correct workspace ID. The workspace role and team creation permissions shown by
      the UI match the API for each workspace.
- [x] **AC11 — Lifecycle.** Deleting empty workspace A leaves owned workspace B and its data
      accessible and removes A from navigation. A workspace containing a project or AI agent
      still returns `409` on deletion. Signing in or making planner requests while an account
      owns workspaces creates no extra personal workspace. Deleting the final workspace retains
      the existing personal workspace fallback. Account deletion processes every owned workspace
      under the existing delete-or-transfer rules.
- [x] **AC12 — Compatibility and delivery.** An existing database with one workspace per
      person supports creation of additional workspaces without changing existing IDs,
      memberships or URLs. The default self-hosted build exposes the feature. Existing API list
      response shapes and edition override hooks stay compatible. The new UI strings follow
      the repository's translation rules. Relevant tests and required checks pass.

## Validation for implementation

Use real test PostgreSQL and the existing API helpers. Cover the new route through HTTP,
including policy and concurrent creation. Extend workspace access and lifecycle tests with
several workspaces owned by one person. Restore global limit and policy overrides after tests.
Run database-backed suites sequentially as required by `AGENTS.md`.

Use UI tests for creation, failure feedback and selector updates. Manually verify switching,
an empty workspace, direct links, reloads, browser back navigation, keyboard use and a narrow
screen. Include an authorized owner, an admin, a member and an outsider in the access checks.

Run `bun run typecheck`, `bun run lint`, `bun run format:check` and `bun run test` from the
repository root. Run `tidy`, `code-review` and `security-audit` on the implementation in that
order. Record the results against the acceptance criteria.

## Verification evidence

Verification date: 2026-11-12. API tests use real PostgreSQL. Browser checks use the standard
CE application and a separate test database. No schema, dependency or deployment change is
required.

| Criterion | Evidence |
| --------- | -------- |
| AC1 | `workspaces.test.ts`: `lets one ordinary account own three workspaces with their own teams`. |
| AC2 | `workspaces.test.ts`: the three-workspace case reads settings and creates a team; `assigns ownership to the authenticated caller` verifies owner derivation. |
| AC3 | `workspaces.test.ts`: parameterized invalid-name and normalized-boundary cases, plus `allows repeated workspace names with distinct IDs`. |
| AC4 | `workspaces.test.ts`: policy recheck, bot refusal, deactivated accounts and disabled-policy owner exception. Container HTTP probes return `401` for anonymous GET capability and POST creation. `WorkspaceRailActions.test.tsx` verifies fresh capability, restriction and retry. |
| AC5 | `workspaces.test.ts`: `admits only one concurrent creation for the last ownership slot`, `allows concurrent creation with the unlimited default`, and `rolls back a workspace when its owner cannot be inserted`. |
| AC6 | `WorkspaceCreateModal.test.tsx` covers pending submissions, retry, cancellation, Enter, Escape and label association. `WorkspaceRailActions.test.tsx` covers both variants and nested picker use. `workspaces.service.test.tsx` verifies cache seeding before navigation. Browser creation succeeds from both selectors. |
| AC7 | Browser checks create a team and an `APP` project in each of two workspaces through the UI. `ManageTeamsLayout.test.tsx`: `creates the first team in the selected empty workspace`. |
| AC8 | Browser checks cover favorites, recent results, an empty workspace, direct links, reload, back navigation, independent tabs and keyboard creation at 390-pixel width. `ProjectSwitcher.test.tsx` verifies scoped requests and empty-workspace search. |
| AC9 | `workspace-access.test.ts`: `keeps an admin and member within their workspace when its owner owns another` covers outsider, admin, member, owner and existing project membership requests. |
| AC10 | `workspaces.test.ts`: `keeps settings independent between workspaces owned by the same person`. Hook and layout tests verify ID-specific caches, route selection and displayed permissions. |
| AC11 | `workspaces.test.ts` covers deleting one of several workspaces, project and agent refusal, sign-in, final-workspace provisioning and account removal. Layout tests and browser deletion verify navigation cleanup. |
| AC12 | Existing-data fixtures preserve IDs, memberships and project references. All 13 locale files contain the new keys. All root checks, the production web build, Docker image builds and Docker integration suites pass. |

Browser verification completed seven flows with no page errors. The projects have distinct
full references, `alpha-mwdxsqeo.APP` and `beta-mwdxsqeo.APP`, despite sharing the project key.
The Docker integration gate passes 2,927 API, 4 bot and 275 worker tests. The isolated Compose
project is `itsaplan-multi-workspaces`; its port override leaves the running instance untouched.

Required checks pass:

- `bun run typecheck`: 12 workspace tasks and the root check.
- `bun run lint`: 12 workspace tasks.
- `bun run format:check`: all matched files.
- `bun run test`: 4,065 tests, zero failures, including 2,927 API and 656 web tests.
- `bun --filter=web run build`: production build succeeds with the CE creation action.
- `docker compose -p itsaplan-multi-workspaces -f docker-compose.test.yml -f .superpowers/sdd/2026-11-12-multiple-workspaces/test-ports.yml build`: API and worker images build.
- The same Compose invocation with `run --rm api-test`: 3,206 integration tests pass.

The disposable test containers are removed. Verification logs, browser results and screenshots
are retained locally in `.superpowers/sdd/2026-11-12-multiple-workspaces/`.

The implementation has completed `tidy`, a fresh code review and a focused security review,
in that order. Neither review has confirmed findings. Proposed commit message:
`feat: support multiple self-hosted workspaces`. No commit or push is authorized.

## Boundaries

This goal covers creation and use of additional workspaces in the existing application model.
It introduces no workspace transfer UI, cross-workspace team or project moves, billing,
administrator quota settings, workspace-specific SSO or SCIM, database-per-workspace storage,
or redesign of worker, bot and runner services.

The existing account-wide inbox and other intentionally aggregated views retain their scope.
Personal API keys retain their account permissions; selecting a workspace is a navigation
action. Existing authorized public links retain their sharing rules. New credentials scoped
to individual workspaces require a separate goal.

No new dependency, environment variable or database table is expected. Any additional change
must be justified by a concrete acceptance criterion.
