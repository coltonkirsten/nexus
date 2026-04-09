# NEXUS

Agent Control System for orchestrating autonomous AI agents.

![NEXUS Dashboard](docs/nexus-dashboard.png)

## What is NEXUS?

NEXUS is a self-hosted platform for creating, managing, and orchestrating AI agents. It provides:

- **Agent Management**: Create, start, stop, and monitor AI agents
- **Team Orchestration**: Group agents into teams for collaborative work
- **Unified Inbox**: Centralized mailbox for agent communications
- **Kanban Boards**: Visual task management for teams
- **Multiple Cell Types**: Support for Claude Code CLI, SDK-based agents, and more
- **Credential Management**: Secure storage for API keys and OAuth tokens

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    NEXUS Dashboard                       │
│                 (React + TypeScript)                     │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP/WebSocket
┌─────────────────────▼───────────────────────────────────┐
│                     NEXUS API                            │
│                 (Node.js + Express)                      │
├─────────────────────────────────────────────────────────┤
│  Agents  │  Teams  │  Mailbox  │  Credentials  │ Boards │
└─────────────────────┬───────────────────────────────────┘
                      │ Docker API
┌─────────────────────▼───────────────────────────────────┐
│                  Agent Containers                        │
│         (Docker cells running Claude Code, etc.)         │
└─────────────────────────────────────────────────────────┘
```

## Quickstart

### Prerequisites

- Node.js 18+
- Docker Desktop (for containerized agents)
- Anthropic API key (or OAuth credentials for Claude Code)

### 1. Clone and Install

```bash
git clone https://github.com/R-A-V-E-N-delegate/nexus.git
cd nexus

# Install API dependencies
cd api && npm install && cd ..

# Install Dashboard dependencies
cd dashboard && npm install && cd ..
```

### 2. Configure Environment

```bash
# Copy example env
cp .env.example .env

# Edit .env if needed (defaults work for local development)
```

For remote access (e.g., over Tailscale), create `dashboard/.env`:
```bash
VITE_API_URL=http://<your-server-ip>:3001
```

### 3. Build and Start

```bash
# Build the API
cd api && npm run build && cd ..

# Start the API (background)
cd api && npm start &

# Start the Dashboard (development mode)
cd dashboard && npm run dev -- --host 0.0.0.0
```

The dashboard will be available at `http://localhost:5173` (or your configured port).

### 4. Create Your First Agent

1. Open the dashboard
2. Click **+ Create** → **Agent**
3. Choose a cell type:
   - **CLI**: Full Claude Code capabilities (requires OAuth)
   - **SDK**: API-based agents (requires API key)
4. Configure the agent's identity in the Ledger
5. Click **Start**

## Directory Structure

```
nexus/
├── api/                 # Backend API server
│   ├── src/
│   │   ├── routes/      # REST endpoints
│   │   └── services/    # Business logic
│   └── data/            # Runtime data (gitignored)
├── dashboard/           # React frontend
│   └── src/
│       ├── components/  # UI components
│       └── api/         # API client
├── cell/                # Agent container engine
├── templates/           # Agent templates
└── docs/                # Documentation
```

## Cell Types

| Type | Description | Auth Required |
|------|-------------|---------------|
| `cli` | Full Claude Code CLI in container | OAuth |
| `sdk` | Anthropic SDK-based agent | API Key |
| `gemini` | Gemini CLI runner | Gemini API Key |

## Security Notes

- Credentials are stored in `api/data/credentials.json` (gitignored)
- The `.env` file is gitignored
- No sensitive data is committed to the repository
- OAuth tokens are synced from macOS Keychain when available

## License

MIT
