# Agent Note: In-app browser as a daily-driver browser

Status: proposed

English | [中文](2026-10-05-in-app-browser-daily-driver.zh.md)

## Problem

The in-app browser is currently an "observation panel for the agent", not a "browser a user can use every day". It deliberately keeps only navigation and observation: an address bar, back/forward/reload, responsive viewport, element picking, open-externally, and DevTools. There is no download entry point, no tab strip, no browsing history, no bookmarks, no permission prompts, no settings panel, and no extensions.

At the same time there is a clear product requirement: let the AI do work on sites the user is **already logged into**. Meeting that requirement means the browser must carry the user's real login state. The in-app browser today uses an isolated `persist:zcode-embedded-browser` partition — a blank profile fully separated from the user's everyday browser — so the agent starts from scratch on every site and the user does not feel that "this is a browser I can actually use".

Those two requirements together raise one question that must be answered: **can the in-app browser have the full experience of a daily-driver browser *and* carry the user's real login state, so that using it feels as natural as using any other browser?**

This note argues the answer is "yes, but with one architectural tradeoff that must be made explicitly", and gives the phase breakdown, a code index, and the list of things that cannot be done.

## Proposal

Upgrade the in-app browser from an "agent observation panel" to a "user daily-driver browser", in four phases. The core design decision: **reusing login state and isolating credentials are mutually exclusive, so we must choose the former and compensate with an outer permission matrix**.

### Phases

| Phase | Content | Prerequisite | Size |
|---|---|---|---|
| P1 | Login-state naturalization: consent flow, repeatable sync, first login inside the app | None (primitives exist) | 2-4 weeks |
| P2 | Browser shell: download shelf + save location, real tab strip + restart restore, context menu, permission prompts, history (source-tagged), print/save-PDF, settings expansion | P1 partition semantics settled | 6-12 weeks |
| P3 | Permission and confirmation layer: per-site × per-action permission matrix, approval modes, history-access approval gate | Ships with P1 | 4-8 weeks |
| P4 | Extension migration: copy installed extensions from the user profile and load via `session.loadExtension` | P1/P2 complete | 6-10 weeks |

P3 is not an independent phase; it is a mandatory companion to P1 — see Risks.

### Core design decision: one session, layered permissions

The only viable path to reusing login state is to write credentials into `persist:zcode-embedded-browser`, which is the same session the agent controls over CDP. Once both facts hold, a hard constraint follows:

> Once real login state is imported, **prompt injection from any visited page escalates from "the AI is misdirected into doing something" to "credential exfiltration"**.

This constraint cannot be solved with "two partitions isolating human and agent" — cookies do not cross Chromium partitions, so the agent would never receive login state and the reuse goal collapses to zero.

The design choice is therefore: **keep one session and put the narrowing in an outer permission matrix**. What the agent can see and do for each site and each action category is decided by the matrix, not by a global switch:

```
persist:zcode-embedded-browser  (single partition, shared by human and agent)
  ├─ Login-state sources: (1) imported from the user's Chrome  (2) written by first login inside the app
  ├─ Agent access path: CDP (three tiers: observe / interact / full)
  └─ Permission matrix: per-site × per-action category
       action categories: browsing / downloads / uploads / acting-on-behalf / direct CDP read
       values: allowed / denied / alwaysAllowed / approvalRequired
```

Approval modes are configurable globally (`alwaysAsk` / `neverAsk` / enterprise-policy managed), history access gets its own gate, and full CDP access is an explicit switch carrying an elevated-risk label.

### Three sources of login state

1. **Import**: through the existing `discoverChromeProfile` → master-key read → `importChromeCookies` chain, written into the existing partition. This is the highest-head-start area — the decryption primitives for all three platforms are already written.
2. **First login inside the app**: for sites that were not imported, render the login page in the guest so the user authenticates once; the session then lands in the partition and survives restarts.
3. **Re-sync**: cookies are a snapshot with a lifetime; the user may log out or rotate elsewhere. Import must be a repeatable action, not a one-time migration, with an optional periodic refresh.

### Browser vendor coverage

Current state: the `ChromeBrowserKind` enum covers only Google Chrome channels and Chromium (`chrome`, `chrome-beta`, `chrome-dev`, `chrome-canary`, `chrome-for-testing`, `chromium`) — **not Edge, Brave, Opera, or Vivaldi**.

P1's scope must therefore be stated honestly: this cycle covers Google Chrome only. For users whose default browser is Edge, this cycle's import will not apply to them.

Boundary principle (this proposal sets the principle only; implementation is not expanded here): cookie database format is compatible in principle within the Chromium family, but master-key retrieval and password storage location differ per vendor and must be implemented per vendor. The discovery layer must enumerate by "browser kind" rather than assuming a single vendor, so that adding further support becomes a standalone scope item rather than a change to the import pipeline itself.

### Explicitly out of scope

- **Chrome Web Store distribution**. Electron 41 officially states `.crx` files cannot be loaded; only unpacked directories work. Users cannot install store extensions inside the app.
- **Full MV3 support**. MV3 background service workers are not on Electron's support list, and `chrome.storage.sync` is explicitly unsupported. Extension migration is therefore necessarily "runs if it runs, with a specific failure reason when it does not".
- **Chrome Sync–class cross-device sync**. Requires building an account system and sync infrastructure; this is not a gap a product layer can fill.
- **System default browser**. A brand-and-habit question, not technically solvable.

## Affected surfaces

### New (all new files)

- `packages/shared/src/validationAppSettings.ts` + `protocol.ts` — new settings fields: download location, default search, home page, clear scope, permission matrix, approval modes
- `packages/ui/src/browser/` — download shelf, tab strip, history page, permission-matrix UI, context menu
- `packages/desktop/src/main/browserData/` — productizing the login-state import pipeline (consent, progress, failure-reason classification, repeatable sync)
- `packages/desktop/src/main/browserPermissions/` — per-site permission matrix and approval gates
- `docs/specs/features/in-app-browser.md` — the feature spec at implementation time (see Acceptance criteria)

### To be modified

- `packages/shared/src/browser-use/command-metadata.ts:72` — add permission-related commands to `browserCommandMethodSchema`
- `packages/ui/src/EmbeddedBrowserPaneParts.tsx:44` — add download, history, and settings entries to `BrowserToolbar`
- `packages/desktop/src/main/browserView/browserGuestManager.ts` — **may only net-decrease lines**; see Risks
- `packages/desktop/src/main/desktopBrowserViewIpc.ts` — new permission/download IPC channels
- `architecture-policy.yaml:49` — add a module boundary for the browser subsystem; see Risks

### Already present, no change needed

- Rendering: `<webview>` + isolated persistent partition already works
- Agent control plane: CDP attach and 50 commands already flow
- Shared tabs between human and agent: `claimTab` / `markDeliverable` / `markHandoff` / `listUserTabs` already exist and are structurally isomorphic to industry peers
- Login-state decryption primitives: profile discovery and cookie decryption for all three platforms are ready
- Tab shell persistence: `BrowserTabRecoveryStore` exists and can support restart restore

## Code index

This section is the entry point for review and for writing the implementation plan. It is organized by "where the code is now", not alphabetically. All line numbers are relative to the current branch.

### A. How the browser is embedded

| Location | Content |
|---|---|
| `packages/ui/src/browser-use/BrowserViewportSurface.tsx:146` | The `<webview>` node itself: `partition="persist:zcode-embedded-browser"`, `allowpopups`, `nodeintegrationinsubframes="true"`, `key={webviewGeneration}` for controlled rebuild |
| `packages/ui/src/browser-use/UnifiedBrowserView.tsx:37-48` | Architecture comment: CDP-on-guest, and **why the implementation moved back from `WebContentsView` to `<webview>`** (a native layer occludes DOM overlays) |
| `packages/ui/src/browser-use/HumanBrowserView.tsx:29` | Human branch; viewport preference persisted to settings |
| `packages/ui/src/browser-use/BrowserViewportToolbar.tsx:42` | Responsive viewport toolbar (W × H + zoom) |
| `packages/ui/src/browser-use/BrowserUseSidePaneContent.tsx:76` | Agent branch mount point |
| `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx:1267` | Side-pane mount point |
| `packages/ui/src/EmbeddedBrowserPaneParts.tsx:44` | `BrowserToolbar`: back/forward/reload/address bar/viewport/element picker/more menu — **the entire chrome surface today** |
| `packages/desktop/src/main/desktopWindowChrome.ts:583-660` | Host window `webviewTag` toggle and `will-attach-webview` |
| `packages/desktop/src/main/desktopWindowChrome.ts:651-657` | Guest webPreferences: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` |
| `packages/desktop/src/main/desktopWindowChrome.ts:374-448` | `setWindowOpenHandler`: popup routing (new internal tab / open externally / deny) |
| `packages/desktop/src/main/desktopWindowChrome.ts:450-479` | `will-navigate` guard |
| `packages/desktop/src/main/embeddedBrowserJavaScriptDialog.ts:3` | `DEFAULT_AUTOMATION_GRACE_MS = 3_000`; alert/confirm handling |

### B. Guest reporting and CDP attach

| Location | Content |
|---|---|
| `packages/ui/src/browser-use/UnifiedBrowserView.tsx:445-455` | `did-attach` → report `webContentsId` to main |
| `packages/ui/src/browser-use/UnifiedBrowserView.tsx:301-367` | `reportBrowserGuest`: scope-fingerprint dedupe, owner rebind retry |
| `packages/ui/src/browser-use/UnifiedBrowserView.tsx:642-656` | Webview event wiring (did-attach / dom-ready / did-navigate / did-fail-load / render-process-gone) |
| `packages/desktop/src/main/desktopBrowserViewIpc.ts:67-260` | All BrowserView IPC handlers |
| `packages/desktop/src/host/browserControlMainBridge.ts:1` | Host ↔ main bridge comment |
| `packages/desktop/src/host/index.ts:231` | Bridge registration |
| `packages/desktop/src/main/desktopHostProcess.ts:432` | Main-side execution entry |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:696-699` | `guest.debugger.attach("1.3")` |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:3444-3512` | CDP `sendCommand` passthrough layer |
| `packages/desktop/src/main/browserView/browserCommandTypes.ts:22` | Passthrough comment: `sessionId` targets cross-process iframes (OOPIFs) |

### C. Agent control plane

| Location | Content |
|---|---|
| `packages/shared/src/browser-use/command-metadata.ts:72-122` | `browserCommandMethodSchema`, 50 commands |
| `packages/shared/src/browser-use/commands.ts:481-484` | `evaluate` — runs JS in page scope; **can read `document.cookie`** |
| `packages/shared/src/browser-use/commands.ts:520` | `playwright` — arbitrary Playwright invocation |
| `packages/shared/src/browser-use/commands.ts:490` | `getDialog` |
| `packages/shared/src/browser-use/commands.ts:530` | `browserViewportSet` |
| `packages/desktop/src/main/browserView/browserCommandPageHandlers.ts:170/237/308/332` | navigate / screenshot / snapshot / evaluate |
| `packages/desktop/src/main/browserView/browserCommandInteractionHandlers.ts` | click / type / scroll / drag / hover |
| `packages/desktop/src/main/browserView/browserCommandScripts.ts` | Scripts injected into the guest |
| `packages/desktop/src/main/browserView/browserPlaywrightLocatorExecutor.ts` | Playwright locator executor |

### D. Shared tabs between human and agent (existing isomorphic design)

| Location | Content |
|---|---|
| `packages/desktop/src/main/browserView/browserGuestManager.ts:1173-1195` | `claimTab`: agent claims a user tab |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:1335-1341` | `markDeliverable` / `markHandoff`: mark output / hand back to human |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:1018-1055` | `executeInScope`: scope-isolated command dispatch |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:409-414` | Set of commands that affect tab lifecycle |
| `packages/ui/src/browser-use/UnifiedBrowserView.tsx:106-108` | `browserUseOperationUntil`: operation deadline shared between agent and user |

### E. Login-state import primitives (P1's head start, all present)

| Location | Content |
|---|---|
| `packages/desktop/src/main/browserDataManager.ts:30` | `EMBEDDED_BROWSER_PARTITION = "persist:zcode-embedded-browser"` — the single partition constant |
| `packages/desktop/src/main/browserDataManager.ts:73` | `importChromeBrowserData`: import orchestration |
| `packages/desktop/src/main/browserDataManager.ts:210` | `clearEmbeddedBrowserData`: the reversible exit |
| `packages/desktop/src/main/browserDataManager.ts:123` / `:216` | `session.fromPartition(EMBEDDED_BROWSER_PARTITION)` |
| `packages/desktop/src/main/chromeCookieManager.ts:409` | `importChromeCookies`: cookie write |
| `packages/desktop/src/main/chromeCredentialManager.ts:66` | `readWindowsChromeMasterKey`: Windows DPAPI |
| `packages/desktop/src/main/chromeCredentialManager.ts:51` | `readMacChromeSafeStorageSecret`: macOS Keychain |
| `packages/desktop/src/main/chromeCredentialManager.ts:14` | `ChromeCookieAccessDeniedError` |
| `packages/desktop/src/main/chromeProfileDiscovery.ts:219` | `discoverChromeProfile`, returns `ChromeBrowserKind` |
| `packages/desktop/src/main/chromeInstallationCandidates.ts:23` | **`ChromeBrowserKind` = chrome / chrome-beta / chrome-dev / chrome-canary / chrome-for-testing / chromium — no Edge, Brave, Opera, or Vivaldi** |
| `packages/desktop/src/main/chrome-*.ts` | 7 existing modules: cookie manager / cookie mapping / credential manager / executable discovery / installation candidates / local storage manager / profile discovery |
| `packages/desktop/src/main/chromeLocalStorageManager.ts:394-421` | `runChromeHelper`: **launches a real Chrome process** (`--headless=new`, `--disable-extensions`, `--remote-debugging-port=0`) and connects over WebSocket CDP — proves this repo already runs "consume real Chrome via CDP" |
| `packages/desktop/src/main/chromeLocalStorageManager.ts:562` | `Storage.getCookies`: **this one call site only**, in the import path, for reading the user's cookies. **Not on the in-app guest's control plane** |
| `packages/desktop/src/main/desktopNetworkPolicy.ts:66` | Network policy on the same partition |

### F. Downloads: tracked only, never surfaced

| Location | Content |
|---|---|
| `packages/desktop/src/main/browserView/browserGuestManager.ts:3350-3381` | `setupDownloadTracking`: `guest.session.on("will-download")`, records `{tabId, path, state}` |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:3991-4002` | `refreshRuntimeProtection`: tabs with an active download are exempt from residency eviction |
| — | **No `setSavePath` / `setDownloadPath` / `defaultDownloadDirectory` call anywhere in the repo** — i.e. no save dialog, no download UI, no download-location setting |

### G. Tab lifecycle, restore, and eviction

| Location | Content |
|---|---|
| `packages/desktop/src/main/browserView/browserTabRecoveryStore.ts:66` | `BrowserTabRecoveryStore`: tab shell persistence |
| `packages/desktop/src/main/browserView/browserTabResidencyPolicy.ts:1` | `BROWSER_TAB_LIMIT = 32` |
| `packages/desktop/src/main/browserView/browserTabResidencyPolicy.ts:56` | `selectBrowserTabLimitVictim`: eviction policy |
| `packages/desktop/src/main/browserView/browserTabResidencyCoordinator.ts` | Eviction/suspend coordination |
| `packages/desktop/src/main/browserView/browserRestoreBootstrapProtocol.ts` | Restore bootstrap protocol |
| `packages/desktop/src/main/browserView/browserScreenshot*.ts` | Screenshot and recording |

**Note**: P2 must flip the default semantics from "evictable" to "not evictable" — a daily-driver browser must not kill the user's tabs.

### H. Settings surface (currently very thin)

| Location | Content |
|---|---|
| `packages/shared/src/validationAppSettings.ts:432-433` | The browser settings today have **only two fields**: `embeddedBrowserAllowInsecureCertificates`, `embeddedBrowserViewportPreference` |
| `packages/ui/src/settings/BrowserSettingsSection.tsx` | Settings page: Chrome data import/clear, insecure-certificate toggle, Browser plugin toggle |
| `packages/ui/src/settings/BrowserSettingsSection.tsx:30` | `OFFICIAL_BROWSER_USE_PLUGIN_ID` — "plugin" here means a ZCode app plugin, **not a browser extension** |
| `packages/ui/src/settings/BrowserSettingsSection.tsx:81-110` | `BrowserDataOperation`: import / clear-cache / clear-all |

### I. Gap list (capabilities with zero grep hits)

| Capability | State |
|---|---|
| `session.setPermissionRequestHandler` | **zero hits** — no permission prompts (camera/microphone/location/notifications/popups) |
| Guest-level context menu | **zero hits** — `desktopWindowChrome.ts:721` is a window menu, not a page menu |
| Download UI / save location | See section F |
| Browsing history | No persistence (each tab has `sessionId`/`workspaceKey`, so source attribution is free) |
| Extension loading | `session.loadExtension` has **zero hits**; the only `--disable-extensions` is at `chromeLocalStorageManager.ts:398`, for isolating the external Chrome |
| Password management | Read-only on the import path (`windowsChromeAppBoundKey.ts`, `MacChromeSafeStorageSecretReader`); no manager UI |
| Non-Google browser vendors (Edge / Brave / Opera / Vivaldi) | **not covered** — `ChromeBrowserKind` has no matching enum values; see Proposal "Browser vendor coverage" |

### J. Repository constraints (read before implementing)

| Location | Constraint |
|---|---|
| `.file-size-baseline.json:109` | `browserGuestManager.ts` frozen limit **4067 effective lines** (currently 4639 raw lines) |
| `docs/specs/file-size-ratchet.md` | Rule: registered files may only **decrease**; touching a >1500-line giant file requires a **net line reduction** |
| `AGENTS.md` | Spec-first; Agent Notes in paired English/Chinese; add a spec before new behavior; non-trivial changes need a note |
| `architecture-policy.yaml:49` | `packages/desktop/src` is a single unmanaged root; **the browser subsystem has no declared module boundary** |
| `scripts/check-workspace-freshness.mjs` | Baseline check before starting |

**Implication**: P1-P4 must all be new files. Nothing may be appended to `browserGuestManager.ts`. This constraint fits the proposal naturally — every phase lands in a new directory.

### K. External reference (evidence, not this repo's code)

The following conclusions come from local read-only inspection of a third-party application and are used to establish feasibility. They are not citations of this repo's code.

| Fact | Source |
|---|---|
| A peer Electron desktop app implements **310** `settings.browserUse.*` i18n keys: download management (including `pause`/`resume`), download-location settings, browsing history (paginated, searchable), clear-data (time ranges + per-category), site-permission matrix, autofill and passwords, show-full-URL, developer mode | Its `app.asar` strings |
| Site-permission matrix columns: `browsingColumn` / `downloadsColumn` / `uploadsColumn` / `actionsColumn` / `cdpAccess`; values `allowed` / `denied` / `alwaysAllowed` / `approvalRequired` | Same |
| **History distinguishes `source.agent` from `source.other`** — a design specific to AI browsers | Same |
| `fullCdp` is an explicit switch carrying `elevatedRisk.label`, and can be blocked by enterprise policy | Same |
| `historyApproval`: agent access to history requires approval (`alwaysAsk` / `neverAsk` / `managedDescription`) | Same |
| `profileImport.extensions*`: a full extension-migration pipeline with 14 failure codes (`extensionUnsupportedPermissions`, `extensionBlockedByPolicy`, `extensionChromeComponent`, `extensionProfileClosed`, …) | Same |
| `windowsChrome.consent`: a separate consent step before reading Windows Chrome data | Same |
| Its iab backend and extension backend coexist, distinguished by `metadata.codexSessionId` / `metadata.extensionInstanceId` from `agent.browsers.list()` | Its plugin documentation |

### L. Platform limits (official documentation, verbatim)

| Limit | Source |
|---|---|
| "Electron only supports loading unpacked extensions (i.e., .crx files do not work)" | `node_modules/electron/electron.d.ts:8305` (Electron 41.0.3) |
| `loadExtension` must be called on every boot; not persisted | `node_modules/electron/electron.d.ts:8300-8303` |
| Loading extensions into in-memory sessions is unsupported | `node_modules/electron/electron.d.ts:8310-8311` |
| "Electron does not support the full range of Chrome extensions APIs" | `node_modules/electron/electron.d.ts:8297-8298` |
| `chrome.storage.sync` / `chrome.storage.managed` unsupported | Electron Extensions API docs |
| MV3 background service workers not on the support list | Same (the support list documents only the MV2 `background` key) |

## Alternatives considered

**Option A: two-partition isolation (one for human, one for agent). Rejected.** This is the intuitive "safe" answer, but it destroys the goal on technical grounds. Cookies do not cross Chromium partitions, so the agent would never receive login state and the "reuse the user's login state" premise collapses to zero. We are building this browser *for* login-state reuse; we cannot build it while negating its purpose.

**Option B: no in-app browser; only bridge to the user's installed Chrome (browser extension + Native Messaging). Rejected as the primary path.** Technically the cheapest, and this repo already has the prerequisite capability (`runChromeHelper` already runs WebSocket CDP against a real Chrome). But it cannot deliver the "human and AI collaborating in the same window" experience, which is precisely this product's differentiating position. It may be kept as an optional supplemental path after P4; it is not in scope for this cycle.

**Option C: reuse login state, but disable the agent's cookie-reading capability entirely (leave only DOM-level observe). Partially rejected.** This is genuinely the most conservative security posture, but the cost is that the agent cannot complete a large class of real tasks (reading logged-in page content, following authenticated flows). And `evaluate` can already read `document.cookie`, so closing only the CDP `Storage` domain does not actually narrow anything — narrowing has to happen at the action level (the per-site permission matrix), not the transport level.

**Option D: build our own sync service + our own password manager. Rejected for this cycle.** Building account-level cloud sync is infrastructure-grade investment, not a gap a product layer can fill; building a password manager means taking on a new security responsibility surface. Neither is in scope this cycle.

## Acceptance criteria

1. `docs/specs/features/in-app-browser.md` lands, settling three things: the scope and boundary of login-state reuse, the field schema of the per-site permission matrix, and the rationale for the P4 and "explicitly out of scope" lists.
2. A replayable P1 test: using a fixture Chrome profile, walk consent → import → open an already-logged-in site successfully, with no dependency on real user data and CI runnable without secrets.
3. The permission matrix has an explicit default (`approvalRequired`), and that default is written down in the spec rather than left to implicit code convention.
4. The clear-data path is reversible: after import, `clearEmbeddedBrowserData` can fully remove everything, covered by a test.
5. The PR carrying this proposal must pass `pnpm typecheck`, `pnpm lint`, `pnpm size:check`, `pnpm architecture:check --changed`, and `pnpm docs:check`.
6. The discovery layer's browser enumeration does not hardcode a single vendor, so "support the next browser" becomes a standalone scope item rather than a redesign of P1's import pipeline.
7. All new code lands in new files; `browserGuestManager.ts` net-decreases if touched.

## Risks

- **Credential exfiltration is the primary known risk, and it is one this proposal actively accepts.** After importing real login state, the agent can read non-HttpOnly cookies via `evaluate`, and can attempt `Storage.getCookies` through the CDP passthrough layer (today that call exists only in the import path at `chromeLocalStorageManager.ts:562`, but the `sendCommand` passthrough at `browserGuestManager.ts:3444-3512` is technically reachable). The P3 permission matrix is not optional — it is a mandatory companion to P1.
- **`browserGuestManager.ts` is frozen at 4067 effective lines, currently 4639 raw lines.** Any code appended to that file is blocked by `pnpm size:check`. All new responsibilities must go into new files; splitting that file is a separate task.
- **The browser subsystem is outside architecture-governance scope.** `architecture-policy.yaml:49` declares `packages/desktop/src` as a single unmanaged root — no browserView module, no layering, no publicEntrypoints. This is a pre-existing governance gap, not one introduced by this proposal; but P1 adding `browserData/` and P3 adding `browserPermissions/` widens its surface. Recommend adding the module boundary declaration in the same batch as P1.
- **Product-positioning risk: the daily-browsing entry point is already locked by Chrome/Edge/Safari.** Users will not make a coding IDE's in-app browser their default browser. This proposal targets "a browser good enough at hand while working", not "a replacement for the daily browser". That boundary must be written into the spec, or P2 will expand without limit.
- **P1 covers Google Chrome only, and this is the real scope boundary of this cycle — it must not be glossed over.** The import pipeline built from the 7 existing `chrome-*.ts` modules has no Edge, Brave, Opera, or Vivaldi branch. Reviewers of the spec should be told plainly: if the default browser is Edge, this cycle's import will not apply to that user.
- **The cost of extending to other Chromium vendors is not amortized in this cycle.** Cookie database format is compatible in principle within the family, but master-key retrieval and password storage location differ per vendor. Each added vendor needs its own key-reading implementation and regression coverage; it must not be treated as "swap a path".
- **P4 has diminishing returns.** Extension migration is necessarily "runs if it runs", and roughly half the effort is failure codes rather than the success path. Recommend re-evaluating whether to staff it after P1/P2 ship.
- **This proposal's feasibility case rests on local read-only inspection of a third-party application (see section K), not on this repo's code.** Those findings establish that "a team did this with the same Electron", which is not an implementation guarantee for this repo.
- **This proposal changes no behavior before implementation.** Status is proposed; it does not enter the implementation gate.
