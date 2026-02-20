#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Building nexus-cell:latest..."
docker build -t nexus-cell:latest ./cell
echo "Done."
