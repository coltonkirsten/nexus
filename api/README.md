# @nexus/api

REST API server for managing autonomous agents. Handles agent lifecycle, message queuing, file access, skills management, and real-time terminal/log streaming — all backed by Docker containers.

## Quick Start

```bash
# Install dependencies
npm install

# Development (hot reload)
npm run dev

# Production
npm run build
npm start
```

The server starts on port **3001** by default (configurable via `API_PORT` env var).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_PORT` | Port the API server listens on | `3001` |
| `ANTHROPIC_API_KEY` | API key passed into agent containers | — |

A `.env` file is loaded from the parent NEXUS root directory.

---

## Endpoints

Base URL: `http://localhost:3001`

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | System health check |

```json
// Response
{ "status": "ok", "service": "nexus-api", "timestamp": "2025-01-01T00:00:00.000Z" }
```

---

### Agents

#### List all agents

```
GET /api/agents
```

Returns all agents with their current container status.

```json
{ "agents": [Agent] }
```

#### Get a single agent

```
GET /api/agents/:id
```

Returns `200` with the agent or `404` if not found.

```json
{ "agent": Agent }
```

#### Create an agent

```
POST /api/agents
```

| Body Field | Type | Required | Description |
|------------|------|----------|-------------|
| `name` | string | Yes | Display name for the agent |
| `template` | string | No | Template to initialize the agent with |

```json
// 201 Created
{ "agent": Agent }
```

#### Update an agent

```
PATCH /api/agents/:id
```

| Body Field | Type | Description |
|------------|------|-------------|
| `name` | string | New display name |
| `config` | RuntimeConfig | Runtime configuration (see below) |

**RuntimeConfig:**

| Field | Type | Description |
|-------|------|-------------|
| `model` | string | Model identifier |
| `maxTurns` | number | Maximum agentic turns |
| `timeout` | number | Timeout in seconds |
| `allowedTools` | string[] | List of allowed tool names |

#### Delete an agent

```
DELETE /api/agents/:id
```

Stops the container, removes Docker volumes, and deletes all agent data.

```json
{ "success": true, "message": "Agent deleted" }
```

#### Start an agent

```
POST /api/agents/:id/start
```

Starts the agent's Docker container, waits for the engine health check (up to 30s), initializes the template, and begins the message queue consumer.

#### Stop an agent

```
POST /api/agents/:id/stop
```

Stops the agent's Docker container and queue consumer.

#### Get agent status

```
GET /api/agents/:id/status
```

Returns detailed status including health information.

---

### Messages

Messages are processed asynchronously through a per-agent queue with automatic retry (up to 3 attempts with exponential backoff).

#### Send a message

```
POST /api/agents/:id/messages
```

**Rate limited:** 10 messages/minute per agent. Rate limit info is returned via `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

| Body Field | Type | Required | Description |
|------------|------|----------|-------------|
| `message` | string | Yes | Message content |
| `role` | string | No | `"user"` (default), `"agent"`, or `"system"` |
| `metadata` | object | No | Arbitrary metadata to attach |

```json
// 201 Created
{ "message": Message }
```

#### List messages

```
GET /api/agents/:id/messages
```

Returns all messages in the agent's queue.

```json
{ "messages": [Message] }
```

#### Update message status

```
PATCH /api/agents/:id/messages/:messageId/status
```

| Body Field | Type | Values |
|------------|------|--------|
| `status` | string | `"pending"`, `"processing"`, `"completed"`, `"failed"` |

#### Get queue stats

```
GET /api/agents/:id/queue/stats
```

```json
{
  "stats": {
    "agentId": "...",
    "pending": 2,
    "processing": 1,
    "completed": 10,
    "failed": 0,
    "total": 13
  }
}
```

---

### Sessions

#### Get session info

```
GET /api/agents/:id/session
```

Returns the agent's current conversation session state (proxied to the engine).

#### Clear session

```
POST /api/agents/:id/session/clear
```

Resets the agent's conversation session.

---

### Workspace (Files)

Access files in the agent's `/workspace` volume.

#### List workspace files

```
GET /api/agents/:id/workspace
```

```json
{ "entries": [DirectoryEntry] }
```

#### Read a file

```
GET /api/agents/:id/workspace/file?path=src/index.ts
```

```json
{ "content": "...", "encoding": "utf-8" }
```

Binary files (images, PDFs, etc.) are returned with `"encoding": "base64"`.

---

### Ledger (Agent Memory)

Access files in the agent's `/ledger` volume — persistent memory across sessions.

#### List ledger files

```
GET /api/agents/:id/ledger
```

#### Read a ledger file

```
GET /api/agents/:id/ledger/file?path=notes.md
```

#### Write a ledger file

```
PUT /api/agents/:id/ledger/file?path=notes.md
```

| Body Field | Type | Description |
|------------|------|-------------|
| `content` | string | File content to write |

---

### Skills

Manage reusable skills attached to an agent.

#### List skills

```
GET /api/agents/:id/skills
```

```json
{ "skills": [SkillMetadata] }
```

#### Get a skill

```
GET /api/agents/:id/skills/:skillName
```

#### Create a skill

```
POST /api/agents/:id/skills
```

| Body Field | Type | Required | Description |
|------------|------|----------|-------------|
| `name` | string | Yes | Skill name |
| `description` | string | No | What the skill does |
| `content` | string | No | Skill content/instructions |

#### Update a skill

```
PUT /api/agents/:id/skills/:skillName
```

| Body Field | Type | Description |
|------------|------|-------------|
| `content` | string | Updated skill content |

#### Delete a skill

```
DELETE /api/agents/:id/skills/:skillName
```

---

### Logs & History

#### Stream logs (SSE)

```
GET /api/agents/:id/logs
```

Returns a **Server-Sent Events** stream of real-time log events from the agent engine. Connect with an `EventSource` client.

#### Get invocation history

```
GET /api/agents/:id/history
```

```json
{ "invocations": [Invocation] }
```

#### Get system prompt

```
GET /api/agents/:id/system-prompt
```

Returns the agent's current system prompt (proxied to the engine).

---

### Terminal (WebSocket)

```
ws://localhost:3001/api/agents/:id/terminal
```

Opens an interactive shell session (`/bin/bash`) inside the agent's container as the `agent` user in `/workspace`.

**Resize the terminal** by sending a JSON message:

```json
{ "type": "resize", "cols": 120, "rows": 40 }
```

All other messages are forwarded as stdin to the shell. Output is streamed back over the WebSocket.

---

## Data Types

### Agent

```typescript
{
  id: string;              // UUID
  name: string;
  template?: string;
  createdAt: string;       // ISO 8601
  lastActivity?: string;   // ISO 8601
  containerId?: string;
  port?: number;
  status: 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  config?: RuntimeConfig;
}
```

### Message

```typescript
{
  id: string;              // UUID
  agentId: string;
  content: string;
  role: 'user' | 'agent' | 'system';
  timestamp: string;       // ISO 8601
  metadata?: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}
```

---

## Error Responses

All errors follow a consistent format:

```json
{ "error": "Description of what went wrong" }
```

| Status Code | Meaning |
|-------------|---------|
| `400` | Bad request (missing or invalid parameters) |
| `404` | Resource not found |
| `409` | Conflict (agent is busy) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
| `503` | Agent engine unavailable |

---

## Architecture

```
Client  ──▶  Express API (port 3001)  ──▶  Docker Containers (port 3100+)
                  │                              │
                  ├── Agent State (agents.json)   ├── Engine (HTTP API)
                  ├── Message Queues (queues/)    ├── /workspace volume
                  └── WebSocket (terminal)        └── /ledger volume
```

- Each agent runs in an isolated Docker container (`nexus-cell:latest`)
- The API manages lifecycle, proxies requests to agent engines, and handles message queuing
- Messages are processed asynchronously with retry logic and exponential backoff
- Agent health is monitored every 30 seconds (3 failures = unhealthy)
- File access works both when containers are running (via engine API) and stopped (via Docker cp)
