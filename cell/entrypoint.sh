#!/bin/bash
set -e

# Fix ownership AND permissions of mounted volumes
# Named volumes may be root-owned on first creation or after docker-cp writes
chown -R agent:agent /ledger /workspace /shared
chmod -R u+rwX /ledger /workspace /shared

# Persist Claude CLI session data across container rebuilds
# Sessions are stored in ~/.claude/projects/ - symlink to /ledger/.claude
# This allows session history to survive container recreation
CLAUDE_DIR="/ledger/.claude"
AGENT_CLAUDE_DIR="/home/agent/.claude"

# Create persistent directory if it doesn't exist
mkdir -p "$CLAUDE_DIR"
chown agent:agent "$CLAUDE_DIR"

# Remove existing .claude (could be a directory from previous runs or a broken symlink)
rm -rf "$AGENT_CLAUDE_DIR"

# Create symlink from home to persistent storage
ln -sf "$CLAUDE_DIR" "$AGENT_CLAUDE_DIR"
chown -h agent:agent "$AGENT_CLAUDE_DIR"

# Drop privileges and run the engine as the agent user
exec gosu agent node /opt/engine/dist/main.js
