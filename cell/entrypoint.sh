#!/bin/bash
set -e

# Fix ownership of mounted volumes (they may be root-owned)
chown -R agent:agent /ledger /workspace

# Drop privileges and run the engine as the agent user
exec gosu agent node /opt/engine/dist/main.js
