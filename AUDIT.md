# NEXUS Security & Quality Audit

> Generated 2026-02-16. Address these findings before moving out of prototyping.

---

## CRITICAL — Fix Before Any Deployment

### 1. Docker socket mount = full host root access
**`docker-compose.yml:13`**
Mounting `/var/run/docker.sock` into the API container gives it unrestricted root-level access to the host. Any attacker who compromises the Express API can spawn privileged containers, mount the host filesystem, or escape the container entirely.

**Fix:** Use a Docker socket proxy (e.g., Tecnativa/docker-socket-proxy) that restricts API calls to only the endpoints needed.

### 2. Zero authentication on every endpoint
**`api/src/index.ts:23`** + **`cell/engine/src/main.ts:436`**
Neither the API server, the cell engine, nor the WebSocket terminal has any form of auth. Combined with `cors()` (no origin restriction) and ports bound to `0.0.0.0`, anyone on the local network can create/delete agents, inject messages, open terminal sessions, and read/write arbitrary files.

**Fix:** Add bearer token middleware on all routes, restrict CORS to known origins.

### 3. No container resource limits
**`api/src/services/docker.ts:22-57`**
Agent containers are created with no memory, CPU, or PID limits. An autonomous agent with `permissionMode: "bypassPermissions"` could fork-bomb or exhaust host memory.

**Fix:** Add `Memory`, `NanoCpus`, and `PidsLimit` to the `HostConfig` in `createAgentContainer`.

### 4. No network isolation for agent containers
**`api/src/services/docker.ts`**
Agents use the default Docker bridge network. They can reach the internet, the host network (including the Docker socket), other agents, and the API server. An agent could curl the Docker socket to escape the container.

**Fix:** Create an isolated bridge network per agent, or use `NetworkMode: "none"` where internet access isn't needed.

### 5. Path traversal in Skills API (cell engine)
**`cell/engine/src/main.ts:873,899,920`**
The `/skills/:name` endpoints use `join("/ledger/skills", name, "SKILL.md")` without any sanitization. A request to `/skills/../../etc` resolves to `/etc/SKILL.md`. Unlike the `/files/*` endpoints, skills do **not** use `validatePath()`.

**Fix:** Run the resolved path through `validatePath()` or reject names containing `/` or `..`.

### 6. Path traversal in API file routes
**`api/src/routes/agents.ts:586,635,666`**
The `startsWith('/workspace')` check is trivially bypassed with `/workspace/../../etc/passwd`. No canonicalization or `..` rejection is performed.

**Fix:** Canonicalize paths with `path.resolve()` and verify they remain within the allowed root after resolution.

---

## HIGH — Fix Before Production

### 7. Non-atomic file writes cause data loss on crash
**`api/src/services/agents.ts:40-43`**
`fs.writeFile(AGENTS_FILE, ...)` is not atomic. If the process crashes mid-write, `agents.json` is corrupted and unrecoverable. The catch block silently returns `{ agents: [] }`, effectively deleting all agent data. Same issue for queue files (line 145).

**Fix:** Write-to-temp-then-rename pattern (`fs.writeFile(tmp)` + `fs.rename(tmp, target)`).

### 8. Agent delete doesn't stop queue consumer
**`api/src/routes/agents.ts:197-233`**
The DELETE handler removes the container and volumes but never calls `stopConsumer(id)`. The consumer keeps running, hitting errors for a non-existent agent, leaking SSE connections and retry timers.

**Fix:** Call `stopConsumer(id)` in the DELETE handler before removing the container.

### 9. Stop handler leaves agent in permanent limbo state
**`api/src/routes/agents.ts:279-301`**
If `stopContainer` throws after status is set to `'stopping'` (line 292), the catch block returns a 500 but never resets the status. The agent is stuck in `'stopping'` forever.

**Fix:** Reset status to `'error'` or `'stopped'` in the catch block.

### 10. Orphan container on create failure
**`api/src/routes/agents.ts:143-160`**
Agent record is persisted first, then the Docker container is created. If `createAgentContainer` succeeds but `updateAgent` fails, the container is orphaned. If `createAgentContainer` throws, a "ghost" agent remains in the database with no container.

**Fix:** Reverse the order or add rollback logic in the catch block.

### 11. SSE error response after headers sent
**`api/src/routes/agents.ts:842-845`**
If an error occurs after SSE headers are set and streaming begins, the catch block calls `res.status(500).json(...)`, which throws `ERR_HTTP_HEADERS_SENT`.

**Fix:** Check `res.headersSent` before attempting to send a JSON error.

### 12. Naive Docker log header stripping
**`api/src/routes/agents.ts:817`**
Docker multiplexed stream frames are assumed to always be single 8-byte-header chunks. Multi-frame chunks or split frames will produce garbled log output.

**Fix:** Implement proper Docker stream demux (accumulate buffer, parse 8-byte headers with length field).

### 13. Unhandled promise rejections in setTimeout callbacks
**`api/src/services/queueConsumer.ts:327,354,368`**
Multiple `setTimeout` callbacks are `async` functions whose returned promises are never caught. Unhandled rejections can crash the Node process.

**Fix:** Wrap each async body in `.catch()` or use a helper that swallows errors with logging.

### 14. `runAgent` swallows all errors
**`cell/engine/src/main.ts:393-418`**
Every error is caught and an empty string is returned with `status: "completed"`. Callers cannot distinguish success from failure.

**Fix:** Return a distinct status (e.g., `"error"`) and propagate error details.

### 15. No React Error Boundaries
**`dashboard/src/App.tsx`**
Zero Error Boundaries anywhere. A single rendering exception (malformed SSE data, xterm.js error) crashes the entire app with a white screen.

**Fix:** Add `ErrorBoundary` around `Routes` in `App.tsx` and around each tab in `AgentDetail.tsx`.

### 16. Unbounded recursive directory listing (DoS)
**`cell/engine/src/main.ts:708`**
`listDirectoryRecursive` has no depth limit. Requesting `/files/list?path=/workspace` on a large workspace could OOM the process.

**Fix:** Add a `maxDepth` parameter (e.g., 5) and a max-entries cap.

---

## MEDIUM — Should Fix

### 17. Race conditions on start/stop
**`api/src/routes/agents.ts:236-301`**
No concurrency guard. Two concurrent `POST /:id/start` requests both pass the check, double-start the container, and duplicate `startConsumer` calls.

**Fix:** Add a per-agent mutex or status-based optimistic lock.

### 18. Missing `content` validation on ledger write
**`api/src/routes/agents.ts:653`**
`content` is destructured from `req.body` but never validated as defined or as a string. Could write `"undefined"` to files.

**Fix:** Validate `content !== undefined` and `typeof content === 'string'`.

### 19. YAML injection in skill frontmatter
**`api/src/services/volume.ts:256`**
The original unsanitized skill `name` is embedded in YAML frontmatter. Names with colons, backticks, or newlines break the YAML.

**Fix:** Quote the name value or use the sanitized name.

### 20. `readFileViaTar` returns last file, not target
**`api/src/services/volume.ts:38-71`**
For each non-directory tar entry, `content` is overwritten. If `copyFromContainer` returns multiple files, the function silently returns the last one.

**Fix:** Match on the expected filename or break after the first non-directory entry.

### 21. Symlink following bypasses path validation
**`cell/engine/src/main.ts:708-726`**
`stat()` follows symlinks. A symlink at `/ledger/foo -> /etc/shadow` would bypass `validatePath()` and let the engine read arbitrary files.

**Fix:** Use `lstat()` instead, or `realpath()` and re-validate.

### 22. EventSource memory leak on reconnect (dashboard)
**`dashboard/src/hooks/useAgentLogs.ts:33-45`**
The SSE `connect()` function creates a new `EventSource` but if `onopen` triggers `connect()` again before the old one is closed, orphaned connections accumulate.

**Fix:** Add a `cancelled` ref flag checked at the top of `connect()`.

### 23. Sub-tab switching destroys terminal state
**`dashboard/src/components/WorkspaceUnifiedTab.tsx:49-51`**
Conditional rendering unmounts inactive tabs. Switching away from Terminal destroys the xterm instance, WebSocket, and all history.

**Fix:** Use CSS `display: none/block` to keep components mounted but hidden.

### 24. SettingsTab `EditorPanel` overwrites user edits on refetch
**`dashboard/src/components/SettingsTab.tsx:106-108`**
`useEffect(() => setEditedContent(content), [content])` fires on every query refetch, silently overwriting whatever the user was typing.

**Fix:** Only sync when `editing` is false, or compare values before overwriting.

### 25. Race condition in file fetching (dashboard)
**`dashboard/src/components/LedgerTab.tsx:234-272`**
No `AbortController`. Rapidly switching files causes late responses to overwrite the current file's content.

**Fix:** Use `AbortController` with axios, or ignore responses for stale paths.

### 26. Token usage never resets
**`cell/engine/src/main.ts:62-68`**
Token counters accumulate forever and aren't reset even when the session is cleared. The numbers become meaningless over time.

**Fix:** Reset token counters in the `/session/clear` handler.

### 27. Drain timer marks messages completed without verification
**`api/src/services/queueConsumer.ts:327-340`**
After a timeout, the consumer assumes the message completed successfully. It may have actually failed or still be running.

**Fix:** Check the engine's actual status before marking completed.

### 28. API container runs as root
**`api/Dockerfile`**
No `USER` directive. Combined with Docker socket access, this is root on the host.

**Fix:** Add a non-root user and `USER` directive.

### 29. All ports bind to 0.0.0.0
**`docker-compose.yml:7-8,23-24`** + **`api/src/services/docker.ts:35`**
API, dashboard, and agent engine ports are all network-accessible.

**Fix:** Bind to `127.0.0.1` in compose and in `PortBindings`.

### 30. No `.dockerignore` files
**`api/`**, **`dashboard/`**
Build context includes `node_modules`, `.env`, `.git`, bloating images and potentially leaking secrets.

**Fix:** Add `.dockerignore` files excluding `node_modules`, `.env`, `.git`, `dist`, `*.log`.

---

## LOW — Cleanup Items

| # | Issue | Location |
|---|-------|----------|
| 31 | Rate limiter memory leak (entries never evicted) | `routes/agents.ts:44-73` |
| 32 | Rate limit consumed before checking if agent is running | `routes/agents.ts:406-424` |
| 33 | `clearTimeout` not in `finally` block (timer leak) | `routes/agents.ts:79-84`, `engine.ts:90-108` |
| 34 | History endpoint generates non-deterministic IDs | `routes/agents.ts:709` |
| 35 | Non-null assertion on optional `port` field | `routes/agents.ts:149,250` |
| 36 | `updateAgent` allows overwriting `id`, `createdAt` | `agents.ts:85-98` |
| 37 | Unbounded message queue growth (no pruning) | `agents.ts:150-175` |
| 38 | Dead code in `listenForCompletion` (duplicate map lookup) | `queueConsumer.ts:105-113` |
| 39 | `streamLogs` has no timeout/abort controller | `engine.ts:188-214` |
| 40 | Error handler leaks `err.message` to client | `index.ts:39-45` |
| 41 | No graceful shutdown in API server | `api/src/index.ts` |
| 42 | `AgentStatus` type missing `idle`/`processing` values | `dashboard/types/agent.ts` vs `TerminalView.tsx:21` |
| 43 | Conversation turns recomputed from scratch on every SSE event | `ConversationTab.tsx:53` |
| 44 | Duplicate `clearLogs()` call on session clear | `ConversationTab.tsx:189-192` |
| 45 | Line-based diff algorithm (not LCS) produces misleading diffs | `LedgerTab.tsx:36-60` |
| 46 | No focus trap or keyboard handling in modals | `ConfirmModal.tsx`, `CreateAgentModal.tsx` |
| 47 | Recursive `chown -R` on every container start | `cell/entrypoint.sh:6` |
| 48 | `DEFAULT_MODEL` env var in `.env.example` is unused by code | `.env.example:14` |
| 49 | `getContainerStatus` returns `'created'` when container doesn't exist | `docker.ts:92-96` |
| 50 | `startContainer`/`stopContainer` not idempotent (throw on already started/stopped) | `docker.ts:62-78` |
| 51 | `copyToContainer` fire-and-forget `chown` (detached, exit code unchecked) | `docker.ts:184-189` |
| 52 | `getContainerLogs` returns a following stream with no cleanup mechanism | `docker.ts:114-129` |
| 53 | TOCTOU race between `isRunning` check and engine/docker-cp operation | `volume.ts:120-189` |
| 54 | Config mutation doesn't invalidate the agent query | `SettingsTab.tsx:303-309` |
| 55 | No loading/error states for settings queries | `SettingsTab.tsx:292-300` |
| 56 | WebSocket write to disposed terminal (termRef not nulled on cleanup) | `TerminalView.tsx:155-158` |
| 57 | Multiple rapid WebSocket connections cause UI flicker | `TerminalView.tsx:23-67` |
| 58 | `maxEntries` in useAgentLogs deps causes unnecessary SSE reconnects | `useAgentLogs.ts:70` |
| 59 | Duplicate turn IDs from same-timestamp events | `useConversationStream.ts:19,45` |
| 60 | Regex syntax highlighting highlights keywords inside strings | `WorkspaceTab.tsx:45-152` |
| 61 | Dual source of truth for agent running state (SSE vs polling) | `ConversationTab.tsx:53-55` |
| 62 | No restart policy for API/dashboard services | `docker-compose.yml` |
| 63 | `depends_on` without health condition | `docker-compose.yml:25-26` |
| 64 | Nginx config inline in Dockerfile, missing security headers | `dashboard/Dockerfile:25-40` |
| 65 | Nginx proxy to API lacks timeout configuration | `dashboard/Dockerfile:32-39` |
| 66 | No runtime type validation on API request/response bodies | `api/src/types.ts` |
| 67 | SSRF via `agent.port` manipulation (PATCH allows arbitrary field overwrite) | `agents.ts:85-98`, `engine.ts` |
| 68 | `initialize()` errors don't prevent server start | `api/src/index.ts:131-143` |
| 69 | Health check interval has no guard against overlapping runs | `api/src/index.ts:123-128` |
| 70 | `healthFailures` map never cleaned up for deleted agents | `api/src/index.ts:57` |
