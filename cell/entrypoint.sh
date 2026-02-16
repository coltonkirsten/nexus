#!/bin/bash
set -e

# Fix ownership AND permissions of mounted volumes
# Named volumes may be root-owned on first creation or after docker-cp writes
chown -R agent:agent /ledger /workspace
chmod -R u+rwX /ledger /workspace

# Drop privileges and run the engine as the agent user
exec gosu agent node /opt/engine/dist/main.js
