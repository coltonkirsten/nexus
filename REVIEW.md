# NEXUS Design & UX Review

## Critical Issues (broken or misleading)

- [x] **1. Identity & Memory editing silently fails (404)** — Dashboard calls `PUT /api/agents/:id/identity` and `PUT /api/agents/:id/memory`, but those endpoints don't exist. The only write path is `PUT /api/agents/:id/ledger/file?path=...`. Settings tab edits just 404.

- [x] **2. Agent config is decorative — never reaches the engine** — Settings tab lets you change model, max turns, timeout, and allowed tools. Saved to `agents.json` but never forwarded to the cell engine, which always uses hardcoded defaults (`claude-sonnet-4-5-20250929`, `maxTurns: 50`). NOTE: I think i fixed this after you wrote this list but double check

- [x] **3. Workspace tab silently falls back to fake mock data** — When the workspace API fails, `WorkspaceTab.tsx` silently shows a `MOCK_FILE_TREE` with hardcoded fake files (`README.md`, `main.py`, `config.json`). Users see files that don't exist.

- [x] **4. Missing templates in Create Agent modal** — UI only shows "Blank Agent", but `coder`, `researcher`, and `writer` templates exist on disk and can't be selected.

- [x] **5. SSE reconnection duplicates all logs** — Engine sends full log history on each SSE connection. `useAgentLogs` doesn't clear on reconnect, so every previous message appears multiple times.

- [x] **6. Type mismatch between API and dashboard** — Dashboard `AgentStatus` includes `'idle'` and `'processing'` (never produced by API). Dashboard `Agent` interface missing API fields (`port`, `mode`, `healthStatus`, `template`) and has mismatched `config` shape.

## Design & UX Concerns

- [x] **7. Jarring visual inconsistency between tabs** — Conversation and Settings tabs use the dark indigo theme (`#0a0a0f`, `#1e1e3a`). Files, Ledger, and History tabs use a completely different gray/blue color scheme (`gray-700`, `gray-800`, `blue-600`). Looks like two different apps.

- [x] **8. Two orphaned components (dead code)** — `ConfigTab.tsx` and `SystemPromptTab.tsx` are never imported anywhere. Dead code from a previous iteration that duplicates `SettingsTab`.

- [x] **9. WorkspaceTab and LedgerTab bypass the API client** — These use raw `fetch()` with hardcoded `http://localhost:3001` instead of the centralized axios client. Vite dev proxy won't apply, base URL can't be configured.

- [x] **10. Session toggle is cosmetic** — The session enabled/disabled toggle in ConversationTab updates local state but is never passed to `sendMessage`. It does nothing. NOTE: We should just get rid of session toggle completely. also seems that delete history button doesnt actually delete the history, makes it look deleted but comes back on refresh

- [x] **11. Tab state lost on refresh** — Active tab in `AgentDetail` is `useState` only. Refreshing always returns to the Conversation tab. Should sync to URL (e.g., `/agent/:id/settings`).

- [x] **12. `window.confirm()` for destructive actions** — Delete agent, delete skill, and unsaved changes use native browser dialogs. Looks out of place in the polished dark UI.

- [x] **13. Ambiguous clear/reset buttons** — ConversationTab has a Trash icon (clears logs + session) and RotateCcw icon (clears session only) side by side with no labels. Distinction is too subtle.

- [x] **14. No loading feedback for start/stop** — Clicking Start/Stop on agent cards shows no immediate feedback. Status update relies on 5-second polling, so UI feels unresponsive.

- [x] **15. Incomplete markdown renderer** — Custom `MarkdownContent` doesn't support headings, lists, blockquotes, tables, or images. Claude responses frequently use these. Consider `react-markdown`.

- [x] **16. Agent detail page fetches all agents** — `AgentDetailPage` calls `listAgents()` and filters rather than fetching a single agent by ID. Wasteful and creates cache dependency.

- [x] **17. `lastActivity` is always empty** — Dashboard shows "No activity" on every agent card because the API never populates this field.

- [x] **18. Agent mode (task vs conversation) has no UI** — API supports switching modes via `POST /api/agents/:id/mode`, but there's no toggle in the dashboard. NOTE: I actually wanted to get rid of task mode and only have conversation mode, this is leftover from previous implementation and we should get rid of it.

## Minor / Polish

- [x] **19. HTML title and favicon** — Title is "dashboard" instead of "NEXUS". No favicon (uses default Vite icon).

- [ ] **20. No search/filter on agent overview** — Will be painful with many agents.

- [ ] **21. No pagination for history** — Message history and invocation history load everything at once. Performance will degrade over time.

- [ ] **22. Minimal syntax highlighting** — File viewer only covers Python, JS/TS, and JSON via regex. No support for other languages.

- [ ] **23. Naive diff algorithm in LedgerTab** — Line-by-line comparison without alignment. A single inserted line makes everything after it show as changed.

- [ ] **24. Rate limiting resets on API restart** — In-memory only, not persisted.

- [ ] **25. docker-compose.yml doesn't build the cell image** — Cell image must be built separately with `docker build -t nexus-cell:latest ./cell`. Not documented or automated.

- [ ] **26. Task mode messages stay "pending" forever** — Nothing updates message status to "completed" after the engine finishes processing in fire-and-forget mode. NOTE: get rid of any task mode stuff
