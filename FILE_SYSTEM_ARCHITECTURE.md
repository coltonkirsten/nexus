# Nexus File System Architecture

How files flow through every layer of the system — from Docker volumes to the agent's mind to the dashboard UI.

---

## Architecture at a Glance

```
Dashboard (React, :3000)  →  API Server (Express, :3001)  →  Cell Containers (Docker, :3101+)
     ↕                              ↕                              ↕
  Browser UI                  data/ (host FS)              Docker Named Volumes
  - File tree                 - agents.json                - nexus-ledger-{id}  → /ledger
  - Terminal (xterm.js)       - queues/{id}.json           - nexus-workspace-{id} → /workspace
  - Ledger editor
```

---

## 1. The Container's Filesystem

Each agent runs in an isolated Docker container built from `cell/Dockerfile`. The container is a `debian:bookworm-slim` image with node, python3, git, curl, jq, and bash.

### Directory Layout Inside a Container

```
/
├── workspace/          ← Agent's working directory (Docker volume)
│   ├── (projects, code, scripts, anything the agent creates)
│   └── ...
├── ledger/             ← Agent's identity & memory (Docker volume)
│   ├── identity.md     ← System prompt / behavioral instructions
│   ├── memory/
│   │   └── index.md    ← Persistent memory the agent accumulates
│   ├── skills/
│   │   └── {name}/
│   │       └── SKILL.md  ← Learned skills with YAML frontmatter
│   ├── session_id      ← Persisted Claude Code session ID
│   └── logs.jsonl      ← Engine log file
├── opt/engine/         ← Engine code (baked into image)
│   ├── dist/main.js
│   └── node_modules/
└── home/agent/         ← Home dir for the `agent` user
```

### Volume Mounts

Two **Docker named volumes** are created per agent:

| Volume | Container Path | Purpose |
|--------|---------------|---------|
| `nexus-ledger-{agentId}` | `/ledger` | Identity, memory, skills, session state |
| `nexus-workspace-{agentId}` | `/workspace` | Projects, code, anything the agent builds |

These are Docker managed volumes (not bind mounts), so they persist independently of the container lifecycle. Stopping, restarting, or even recreating the container doesn't touch the data.

### Entrypoint (`cell/entrypoint.sh`)

```bash
#!/bin/bash
set -e
chown -R agent:agent /ledger /workspace
exec gosu agent node /opt/engine/dist/main.js
```

Runs as root briefly to fix volume ownership (Docker volumes can default to root), then drops to the unprivileged `agent` user via `gosu`.

---

## 2. The Agent's Perspective

The agent is a Claude Code instance running inside the cell engine (`cell/engine/src/main.ts`). It operates with **full permissions** (`bypassPermissions` mode) and has access to: `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`.

### What the Agent Sees

The agent's CWD is `/workspace`. From its perspective:

- **`/workspace`** — "My desk." This is where it creates projects, writes code, runs commands, installs packages, clones repos. It's the default working directory for all Claude Code tool invocations.
- **`/ledger/identity.md`** — "Who I am." Read at the start of every invocation to build the system prompt. The agent can modify this to evolve its own behavior.
- **`/ledger/memory/index.md`** — "What I remember." Persistent notes the agent writes to itself. Read at every invocation as part of the system prompt.
- **`/ledger/skills/*/SKILL.md`** — "What I know how to do." Skill names and descriptions are included in the system prompt; full skill files are read on-demand via the `Read` tool.

### System Prompt Assembly

Every time the agent is invoked, the engine dynamically builds its system prompt:

```
# Identity
(contents of /ledger/identity.md)

---

# Memory
(contents of /ledger/memory/index.md)

---

# Available Skills
- **skill-name**: description from YAML frontmatter
- ...
```

### Self-Modification

The agent can modify its own ledger files through its tools. This means it can:
- Update its memory with learned facts
- Refine its own identity/instructions
- Create new skills or update existing ones
- All changes persist across invocations via the volume

### Session Persistence

When enabled, the Claude Code session ID is saved to `/ledger/session_id` and restored on the next invocation, allowing the agent to maintain conversation context across separate messages.

---

## 3. The API Layer (File Access)

The API server (`api/`) orchestrates everything. It talks to Docker via the socket and proxies file operations to/from containers.

### Dual-Path File Access (`api/src/services/volume.ts`)

The volume service uses a **hybrid strategy** depending on container state:

```
Container RUNNING?
  ├── YES → HTTP proxy to engine's /files/* API (fast)
  └── NO  → Docker cp via tar archive extraction (slower, read-only)
```

**When running:** Requests are proxied to the engine's filesystem API inside the container (`http://localhost:{port}/files/*`). This supports reads, writes, deletes, and directory listings.

**When stopped:** Uses `container.getArchive()` (the Docker equivalent of `docker cp`) to extract files as tar streams. Only reads and directory listings work — writes require a running container.

### Engine's Filesystem API (inside the container)

The engine exposes these endpoints, restricted to `/ledger` and `/workspace` with path traversal protection:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/files/list?path=` | GET | Recursive directory listing |
| `/files/read?path=` | GET | Read file content + metadata |
| `/files/write` | PUT | Write/create file (auto-creates parent dirs) |
| `/files/delete?path=` | DELETE | Delete file or directory |
| `/files/mkdir` | POST | Create directory |

### API Routes That Touch Files

| Route | What it does |
|-------|-------------|
| `GET /api/agents/:id/workspace` | List `/workspace` file tree |
| `GET /api/agents/:id/workspace/file?path=` | Read a workspace file |
| `GET /api/agents/:id/ledger` | List `/ledger` file tree |
| `GET /api/agents/:id/ledger/file?path=` | Read a ledger file |
| `PUT /api/agents/:id/ledger/file?path=` | Write/update a ledger file |
| `WS /api/agents/:id/terminal` | Interactive shell (WebSocket) |

### Template Initialization

Templates live at `./templates/{name}/` on the host (bind-mounted into the API container). Each template provides:

```
templates/{name}/
├── identity.md       ← Default identity for this agent type
├── template.json     ← Metadata and defaults
└── skills/
    └── {skill-name}/
        └── SKILL.md  ← Pre-built skills
```

On first start, the API posts template content to the engine's `/init` endpoint, which writes it to `/ledger`. This is **idempotent** — if `/ledger/identity.md` already exists, initialization is skipped.

---

## 4. The Dashboard's Perspective

The dashboard provides three ways to interact with agent files.

### 4a. Workspace File Browser (`WorkspaceTab`)

A read-only split-pane file browser:
- **Left panel:** Recursive file tree from `GET /api/agents/:id/workspace`
- **Right panel:** File content viewer from `GET /api/agents/:id/workspace/file?path=`
- Supports syntax highlighting for Python, JS/TS, JSON
- File download via browser blob
- No editing — workspace files are the agent's domain

### 4b. Ledger Editor (`LedgerTab`)

A split-pane browser **with editing**:
- **Left panel:** Ledger file tree from `GET /api/agents/:id/ledger`
- **Right panel:** Textarea editor with save/discard
- **Diff viewer** — shows line-by-line diffs of your local edits
- **External change detection** — detects when the agent modifies a file you're viewing, shows an "External Changes (Agent)" diff
- Saves via `PUT /api/agents/:id/ledger/file?path=`
- Warns about unsaved changes when switching files

### 4c. Terminal (`TerminalView`)

Full interactive terminal using xterm.js:
- Connects via WebSocket to `ws://localhost:3001/api/agents/:id/terminal`
- The API creates a `docker exec` session running `/bin/bash` inside the container
- Runs as the `agent` user
- Supports resize events, clickable URLs
- You see exactly what the agent sees — same `/workspace`, same `/ledger`
- Only works when the container is running

### 4d. Settings Tab (Indirect File Access)

The settings tab provides structured editors for:
- **Identity** (`/ledger/identity.md`) — inline text editor
- **Memory** (`/ledger/memory/index.md`) — inline text editor
- **Skills** (`/ledger/skills/*/SKILL.md`) — CRUD interface with create/edit modal
- These all write through the API to the same ledger files

---

## 5. File Lifecycle

### Creation

```
1. User creates agent
   └── API creates Docker named volumes (empty)
       ├── nexus-ledger-{id}
       └── nexus-workspace-{id}

2. User starts agent
   └── API starts container
       └── Entrypoint fixes ownership
           └── Engine starts
               └── API sends template to /init
                   └── Engine writes to /ledger (if first run):
                       ├── identity.md
                       ├── memory/index.md
                       └── skills/*/SKILL.md
```

### Active Use

```
Files are created/modified through three paths:

A. Agent autonomy (most common)
   User sends message → API → Engine → Claude Code SDK
   Claude Code uses Write/Edit/Bash tools → files appear in /workspace
   Claude Code updates memory/skills → files change in /ledger

B. Dashboard editing
   User edits in LedgerTab or SettingsTab
   Dashboard → PUT /api/agents/:id/ledger/file → volume.ts → engine /files/write
   (Only ledger files, only when container is running)

C. Terminal access
   User types commands in TerminalView
   WebSocket → docker exec bash → direct filesystem access
   Can touch anything in /workspace or /ledger
```

### Reading

```
Container running:
  Dashboard → API → HTTP to engine /files/* → reads from volume → returns content

Container stopped:
  Dashboard → API → docker cp (getArchive) → tar extraction → returns content

Terminal:
  Only available when running. Direct shell access.
```

### Persistence

Files survive:
- Container stops and restarts
- Container recreation (volumes are external)
- API server restarts (volumes managed by Docker)
- System reboots (Docker volumes persist)

Files do NOT survive:
- Explicit agent deletion (`DELETE /api/agents/:id`)
- Manual `docker volume rm`
- Docker system prune (if volumes are dangling)

### Deletion

```
User deletes agent
└── API stops container
    └── API removes container
        └── API removes volumes
            ├── docker.getVolume("nexus-ledger-{id}").remove()
            └── docker.getVolume("nexus-workspace-{id}").remove()
        └── API deletes metadata
            ├── removes from agents.json
            └── deletes data/queues/{id}.json
```

---

## 6. API Server's Own Data

The API server stores its state on the host filesystem (bind-mounted from `./data`):

| File | Purpose |
|------|---------|
| `data/agents.json` | All agent records (id, name, port, status, mode, config) |
| `data/queues/{agentId}.json` | Message queue/history per agent |

These live on the host, not in Docker volumes. They persist as long as the host filesystem does.

---

## 7. Security Boundaries

| Boundary | Mechanism |
|----------|-----------|
| Agent isolation | Each agent is a separate Docker container |
| Volume isolation | Each agent has its own named volumes, no cross-access |
| Path restriction | Engine's `/files/*` API rejects paths outside `/ledger` and `/workspace`, blocks `..` traversal |
| User separation | Container runs as unprivileged `agent` user (via gosu) |
| Write restriction | Dashboard can only write to `/ledger`, not `/workspace` (workspace is the agent's domain) |
| Terminal access | Requires running container, runs as `agent` user |

---

## 8. Quick Reference

### Where does X live?

| Thing | Location | Persisted By |
|-------|----------|-------------|
| Agent's code/projects | `/workspace` in container | `nexus-workspace-{id}` volume |
| Agent's identity | `/ledger/identity.md` | `nexus-ledger-{id}` volume |
| Agent's memory | `/ledger/memory/index.md` | `nexus-ledger-{id}` volume |
| Agent's skills | `/ledger/skills/*/SKILL.md` | `nexus-ledger-{id}` volume |
| Agent's session | `/ledger/session_id` | `nexus-ledger-{id}` volume |
| Agent metadata | `data/agents.json` | Host filesystem (bind mount) |
| Message history | `data/queues/{id}.json` | Host filesystem (bind mount) |
| Templates | `templates/{name}/` | Host filesystem (bind mount, git-tracked) |
| Engine code | `/opt/engine/` in container | Baked into Docker image |
