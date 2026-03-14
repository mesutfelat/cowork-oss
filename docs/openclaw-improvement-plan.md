# CoWork OS vs OpenClaw: Improvement Plan

**Last updated:** Aligned with current local codebase (docs, kit contracts, Settings structure).

---

## Executive Summary

CoWork OS already exceeds OpenClaw in several areas (feedback learning, encryption, unified memory synthesis). The main gaps are: (1) **adaptiveStyleEnabled** and **channelPersonaEnabled** exist in guardrails but are **not exposed in the UI** (GuardrailSettings.tsx), (2) session-level memory indexing and daily logs (OpenClaw-style `memory/YYYY-MM-DD.md`), (3) feedback UX (thumbs up/down) to surface the existing backend. **USER.md already exists** in `.cowork/` via kit-contracts and workspace init templates.

---

## Comparison Matrix

| Aspect | OpenClaw | CoWork OS | Winner / Gap |
|--------|----------|-----------|---------------|
| **Personalization** | `USER.md`, `IDENTITY.md`, `SOUL.md` in workspace | `UserProfileService`, `RelationshipMemoryService`, **USER.md in `.cowork/`** (kit-contracts), `MemorySynthesizer` | CoWork has both file-based and structured memory |
| **Session memory** | `MEMORY.md`, `memory/YYYY-MM-DD.md`, session transcripts indexed | `MemoryService`, `search_memories`, `MEMORY.md` in kit, hybrid BM25+embeddings | Gap: no daily logs, no session transcript indexing |
| **Style adaptation** | Static SOUL/IDENTITY prompts | `AdaptiveStyleEngine` — **exists but no UI toggle** | CoWork ahead but not discoverable |
| **Feedback learning** | None | `FeedbackService`, `UserProfileService.ingestUserFeedback`, `PlaybookService` | CoWork ahead |
| **Privacy** | Local-first, no encryption | `SecureSettingsRepository` (OS keychain + AES) | CoWork ahead |

---

## Current Codebase Snapshot

### Docs Structure

- **docs/** — Main documentation (VitePress-style `docs/index.md` with hero, features)
- **docs/evolving-agent-intelligence.md** — Evolving Intelligence architecture
- **docs/openclaw-comparison.md** — Alternative positioning
- **docs/openclaw-feature-comparison.md** — Feature-by-feature comparison
- **docs/openclaw-improvement-plan.md** — This plan
- **README.md** — Links to `docs/getting-started.md`, `docs/evolving-agent-intelligence.md`, etc.

### Kit Contracts (`.cowork/`)

- **src/electron/context/kit-contracts.ts** — Defines `USER.md`, `MEMORY.md`, `SOUL.md`, `IDENTITY.md`, `BOOTSTRAP.md`, `VIBES.md`, `LORE.md`, etc.
- **USER.md** — Already in `WORKSPACE_KIT_CONTRACTS` with `parser: "kv-lines"`, `mutability: "user_owned"`
- **Workspace init templates** — In `src/electron/ipc/handlers.ts` (e.g. USER.md template at ~line 5590)
- **Kit injection** — `src/electron/context/kit-injection.ts` uses `WORKSPACE_PROMPT_ORDER` to build context

### Settings Structure

- **Settings tabs** — `guardrails` (Safety Limits), `memory` (MemoryHubSettings), `briefing` (BriefingPanel), etc.
- **GuardrailSettings** — `src/renderer/components/GuardrailSettings.tsx` — Does **not** render `adaptiveStyleEnabled` or `channelPersonaEnabled`
- **Guardrail defaults** — `src/electron/guardrails/guardrail-manager.ts` (both default `false`)

### Memory & Feedback

- **MemorySynthesizer** — `src/electron/memory/MemorySynthesizer.ts` — Merges 6 sources
- **WorkspaceKitContext** — `src/electron/memory/WorkspaceKitContext.ts` — Includes kit files (USER.md, etc.)
- **AssistantMessageContent** — `src/renderer/components/AssistantMessageContent.tsx` — Renders assistant messages (candidate for thumbs)
- **MainContent** — Uses `AssistantMessageContent` for message display

---

## Implementation Plan

### Phase 1: Expose Evolving Intelligence Toggles (Low Effort)

**Goal:** `adaptiveStyleEnabled` and `channelPersonaEnabled` exist in `GuardrailSettings` but have no UI. Add them so users can enable these features.

| Task | Description | Files |
|------|-------------|-------|
| 1.1 Add Adaptive Style toggle | Add "Adaptive Style" section to GuardrailSettings: checkbox for `adaptiveStyleEnabled`, number input for `adaptiveStyleMaxDriftPerWeek`. | [src/renderer/components/GuardrailSettings.tsx](src/renderer/components/GuardrailSettings.tsx) |
| 1.2 Add Channel Persona toggle | Add "Channel Persona" section: checkbox for `channelPersonaEnabled`. | [src/renderer/components/GuardrailSettings.tsx](src/renderer/components/GuardrailSettings.tsx) |
| 1.3 Evolution Metrics on dashboard | Add "How is the agent improving?" card to HomeDashboard when user has 10+ completed tasks, linking to Briefing or Usage Insights. | [src/renderer/components/HomeDashboard.tsx](src/renderer/components/HomeDashboard.tsx) |

---

### Phase 2: USER.md Visibility (Low Effort)

**Goal:** USER.md already exists in kit-contracts and is created on workspace init. Improve discoverability.

| Task | Description | Files |
|------|-------------|-------|
| 2.1 Bootstrap prompt | Ensure BOOTSTRAP.md (or onboarding) prominently prompts users to fill `.cowork/USER.md`. Already referenced in handlers.ts bootstrap content. | [src/electron/ipc/handlers.ts](src/electron/ipc/handlers.ts) |
| 2.2 Quick-edit link | Add "Edit User Profile" or "Open USER.md" link in Memory settings or workspace kit UI so users can open `.cowork/USER.md` in editor. | [src/renderer/components/MemoryHubSettings.tsx](src/renderer/components/MemoryHubSettings.tsx) or [src/renderer/components/MemorySettings.tsx](src/renderer/components/MemorySettings.tsx) |

---

### Phase 3: Session-Level Memory and Daily Logs (Medium–High Effort)

**Goal:** Add OpenClaw-style daily logs (`memory/YYYY-MM-DD.md`) and optional session transcript indexing.

| Task | Description | Files |
|------|-------------|-------|
| 3.1 Daily log service | Create `DailyLogService` that writes to `.cowork/memory/YYYY-MM-DD.md`. Append-only. | New: `src/electron/memory/DailyLogService.ts` |
| 3.2 memory_save daily_log type | Extend `memory_save` tool (or add `append_daily_log`) to write to daily log. | [src/electron/agent/tools/memory-tools.ts](src/electron/agent/tools/memory-tools.ts) |
| 3.3 Load today + yesterday | Include today's and yesterday's daily log snippets in MemorySynthesizer or WorkspaceKitContext when building context. | [src/electron/memory/MemorySynthesizer.ts](src/electron/memory/MemorySynthesizer.ts) or [src/electron/memory/WorkspaceKitContext.ts](src/electron/memory/WorkspaceKitContext.ts) |
| 3.4 Session transcript indexing (optional) | Index recent task messages for `search_memories` when `sessionMemoryEnabled` is true. | [src/electron/memory/MemoryService.ts](src/electron/memory/MemoryService.ts), [src/electron/database/repositories.ts](src/electron/database/repositories.ts) |

---

### Phase 4: Feedback UX and Thumbs (Low–Medium Effort)

**Goal:** Add explicit thumbs up/down to assistant messages so users can easily send feedback.

| Task | Description | Files |
|------|-------------|-------|
| 4.1 Thumbs in message bubbles | Add thumbs up/down buttons to AssistantMessageContent (or parent message row). On click, call `user_feedback` IPC with `decision: "accepted"` or `"rejected"`. | [src/renderer/components/AssistantMessageContent.tsx](src/renderer/components/AssistantMessageContent.tsx), [src/renderer/components/MainContent.tsx](src/renderer/components/MainContent.tsx) |
| 4.2 Wire to daemon | Ensure feedback flows to `FeedbackService` and `UserProfileService.ingestUserFeedback`. Daemon already captures `user_feedback` events. | [src/electron/agent/daemon.ts](src/electron/agent/daemon.ts) |
| 4.3 Evolution Metrics | Ensure correction rate and FeedbackService patterns are visible in EvolutionMetricsService and Daily Briefing. | [src/electron/memory/EvolutionMetricsService.ts](src/electron/memory/EvolutionMetricsService.ts), [src/renderer/components/BriefingPanel.tsx](src/renderer/components/BriefingPanel.tsx) |

---

### Phase 5: Documentation and Parity Checklist

| Task | Description | Files |
|------|-------------|-------|
| 5.1 Parity checklist | Create `docs/openclaw-parity.md` listing what CoWork has vs OpenClaw and recommended settings for "OpenClaw-like" experience. | New: `docs/openclaw-parity.md` |
| 5.2 README cross-link | Add brief mention of OpenClaw parity in README or docs index. | [README.md](README.md), [docs/index.md](docs/index.md) |

---

## Recommended Implementation Order

1. **Phase 1** — Expose toggles (quick win, no new subsystems)
2. **Phase 4** — Feedback thumbs (makes existing backend visible)
3. **Phase 2** — USER.md visibility (low effort)
4. **Phase 3** — Daily logs + session memory (higher impact, more work)
5. **Phase 5** — Docs

---

## What CoWork Already Does Better Than OpenClaw

- **Unified Memory Synthesizer** — 6 sources, dedup, relevance ranking
- **Adaptive Style Engine** — Learns from messages and feedback (needs UI toggle)
- **Feedback learning** — FeedbackService, Playbook, ImprovementCandidateService
- **Encryption** — SecureSettingsRepository
- **Playbook-to-Skill** — Auto-promotion of patterns to governed skills
- **Channel Persona** — Per-channel style (needs UI toggle)
- **USER.md** — Already in `.cowork/` via kit-contracts

---

## Key File References (Current Paths)

| Component | Path |
|-----------|------|
| Kit contracts (USER.md, MEMORY.md, etc.) | `src/electron/context/kit-contracts.ts` |
| Workspace init templates | `src/electron/ipc/handlers.ts` (~line 5590) |
| Kit injection | `src/electron/context/kit-injection.ts` |
| Memory synthesis | `src/electron/memory/MemorySynthesizer.ts` |
| Workspace kit context | `src/electron/memory/WorkspaceKitContext.ts` |
| User profile | `src/electron/memory/UserProfileService.ts` |
| Relationship memory | `src/electron/memory/RelationshipMemoryService.ts` |
| Adaptive Style Engine | `src/electron/memory/AdaptiveStyleEngine.ts` |
| Channel Persona | `src/electron/memory/ChannelPersonaAdapter.ts` |
| Guardrail defaults | `src/electron/guardrails/guardrail-manager.ts` |
| GuardrailSettings UI | `src/renderer/components/GuardrailSettings.tsx` |
| Memory settings | `src/renderer/components/MemoryHubSettings.tsx`, `MemorySettings.tsx` |
| Assistant messages | `src/renderer/components/AssistantMessageContent.tsx` |
| Home dashboard | `src/renderer/components/HomeDashboard.tsx` |
| Daily briefing | `src/renderer/components/BriefingPanel.tsx` |
| Evolving Intelligence docs | `docs/evolving-agent-intelligence.md` |
