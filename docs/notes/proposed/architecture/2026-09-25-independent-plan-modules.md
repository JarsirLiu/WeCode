# Agent Note: Independent plan modules and lifecycle controls

Status: proposed

[中文](2026-09-25-independent-plan-modules.zh.md)

## Problem

The current Coding Plan and Start Plan implementation combines product preview, account identity, entitlement discovery, quota snapshots, model admission, runtime credentials, and purchase flows. Start Plan is exposed through remote `client/configs` while its entitlement is checked through `billing/balance`, but the UI presents both as one provider-family experience.

This makes it difficult to disable the official Start Plan without affecting ordinary Coding Plan behavior, and makes a future replacement with an in-house plan unnecessarily invasive. The contract for unauthenticated users is also unclear: seeing a plan preview is not the same as being allowed to use its models.

## Proposal

Treat every plan family as an independently controllable plan module. Start Plan, individual Coding Plan, team Coding Plan, and a future in-house plan will expose the same capability ports while keeping provider-specific adapters separate.

The module contract is split into:

1. `catalog`: display name, description, entitlement preview, model presentation, and purchase or activation links.
2. `identity`: login/session requirements and account identity lookup.
3. `entitlement`: pending, active, expired, or unavailable state.
4. `quota`: remaining units, reset times, plan association, and usage presentation.
5. `admission`: model allow-list and server-side request authorization.
6. `billing`: purchase, renewal, activation, and payment operations when supported.

Each module has an explicit lifecycle policy:

- `enabled`: it may expose catalog, query entitlement, publish models, and authorize requests.
- `catalog-disabled`: no catalog or preview is fetched or rendered; existing active accounts may remain usable only if policy explicitly permits it.
- `runtime-disabled`: no new model admission or quota refresh is allowed; cached state must not authorize new requests.
- `retired`: it is no longer registered for new selection, while migration code may still read and convert persisted legacy selections.

The default disable policy is fail-closed: no remote catalog request, entitlement or quota request, model exposure, runtime credential resolution, or purchase entry point. Each module owns its endpoints, response validation, cache namespace, provider identifiers, and feature flags. Shared UI and runtime consume normalized snapshots instead of branching on vendor plan names.

The existing Start Plan code remains as a reference adapter during transition. Its official preview loader is independently switchable from its entitlement and balance adapter. A future in-house module implements the same normalized ports without modifying the BigModel or Z.ai provider adapters.

## Module boundary

```text
Plan module registry
  -> lifecycle policy and capability flags
  -> plan adapter (official Start / individual / team / in-house)
  -> normalized catalog, entitlement, quota, and admission snapshots
  -> UI hooks and model registry projection
  -> runtime request authorization
```

The registry owns enablement and registration. An adapter owns remote protocols and credentials. `packages/shared` owns normalized types and strict validation schemas. `packages/services` owns adapters, endpoint calls, caching, and runtime authorization. `packages/ui` owns presentation and user actions through service hooks; it must not call plan endpoints directly.

The module must not use “not currently selected” as “not entitled”. Selection state, account identity, entitlement state, and runtime admission remain separate facts.

## Start Plan lifecycle and access contract

The current implementation behaves as follows:

- An unauthenticated user may see a Start Plan preview when remote `data.configs.startPlanPreview` exists and the card is enabled. This is catalog exposure only.
- An unauthenticated user cannot use Start Plan models. The request path requires `zcodejwttoken`; the request auth service resolves this token for `planKind: "start-plan"` and rejects a missing token.
- Login alone is insufficient. The availability path calls `billing/balance` and requires a successful response containing an active Start Plan. Missing token, failed authentication, no active plan, expiry, or no server-allowed model blocks admission.
- Start Plan is not necessarily purchased. A server-recognized active grant or claim also qualifies; the UI’s disconnected or not-purchased state reflects the entitlement result.
- A pending plan may be displayed, but cannot authorize requests until the effective time and active server entitlement are confirmed.
- Quota exhaustion, model allow-list absence, concurrency limits, and runtime credential failure are independent denial conditions.

The future in-house plan preserves this order: identity, entitlement, quota and model admission, then request credential resolution at the runtime boundary. UI state or cached catalog is never sufficient to authorize a model request.

## Migration and retirement

1. Introduce the registry and lifecycle policy without changing normalized UI/runtime contracts.
2. Register official Start Plan and Coding Plan as separate adapters.
3. Disable official Start Plan catalog loading first; verify ordinary Coding Plan catalog and purchase flows.
4. Disable official Start Plan runtime and quota capabilities; persisted selections become explicitly unavailable rather than silently falling back.
5. Add the in-house adapter and server-side admission path behind its own flag.
6. Migrate users and persisted selections explicitly, then mark the official adapter retired. Keep its adapter and tests until the migration and rollback window closes.

## Alternatives considered

**Delete official Start Plan immediately:** Rejected because it loses a working reference for catalog, JWT runtime auth, entitlement, quota attribution, pending states, and model allow-list handling.

**Use one global `codingPlanEnabled` flag:** Rejected because disabling Start Plan would also disable individual and team plans, and cannot express catalog-only versus runtime shutdown.

**Keep adding `if (isStartPlan)` branches:** Rejected because vendor-specific behavior would spread across package boundaries and bind the in-house replacement to official names.

**Treat login as sufficient access:** Rejected because the server independently checks active entitlement, model eligibility, and quota.

## Acceptance criteria

- Each plan module can be enabled, catalog-disabled, runtime-disabled, or retired without changing unrelated modules.
- Disabling official Start Plan stops its preview/catalog, entitlement/balance, model projection, runtime credential resolution, and purchase entry points according to policy.
- An unauthenticated user can see a preview only when catalog is enabled, but cannot use a Start Plan model.
- A logged-in user without active server entitlement cannot use a Start Plan model.
- Pending, expired, exhausted, or model-ineligible plans cannot authorize requests.
- Persisted selections for disabled or retired modules become explicitly unavailable and never silently fall back.
- The in-house module can reuse normalized contracts without importing the official adapter or vendor endpoints.
- Tests cover lifecycle gating, unauthenticated preview versus runtime denial, active admission, pending/expired states, quota exhaustion, and selection migration.

## Risks

- Separate catalog and runtime flags can show a plan users cannot use; runtime shutdown should default to catalog shutdown unless a migration message exists.
- Cached snapshots could authorize after shutdown; runtime admission must check lifecycle before consuming cached state.
- Retired identifiers can strand persisted selections; migration must be explicit and tested before removing aliases.
- Keeping the official adapter costs maintenance and may preserve obsolete endpoint assumptions; mark it legacy after the in-house module is active.
- Normalized contracts can hide vendor differences; adapters must reject ambiguous responses instead of coercing them to active entitlement.
