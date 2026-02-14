# NEXUS Cell - Autonomous Agent Container

# --- Stage 1: Build the TypeScript engine ---
FROM node:22-bookworm-slim AS builder

WORKDIR /build

COPY ./engine/package*.json ./
RUN npm install

COPY ./engine/tsconfig.json ./
COPY ./engine/src/ ./src/
RUN npm run build

# --- Stage 2: Runtime image ---
FROM debian:bookworm-slim

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install base dependencies
RUN apt-get update && apt-get install -y \
    bash \
    git \
    curl \
    jq \
    python3 \
    python3-pip \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 LTS via nodesource
RUN mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user "agent"
RUN useradd -m -s /bin/bash agent

# Set working directory
WORKDIR /workspace

# Copy engine code (package.json first for caching)
COPY --chown=agent:agent ./engine/package*.json /opt/engine/

# Install production dependencies only
WORKDIR /opt/engine
RUN npm install --omit=dev

# Copy compiled engine code from builder stage
COPY --chown=agent:agent --from=builder /build/dist/ /opt/engine/dist/

# Create ledger directory structure
RUN mkdir -p /ledger/memory /ledger/skills && chown -R agent:agent /ledger

# Switch back to workspace
WORKDIR /workspace

# Switch to non-root user
USER agent

# Default port
ENV ENGINE_PORT=3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${ENGINE_PORT}/health || exit 1

# Entrypoint - run the compiled JS from dist/
ENTRYPOINT ["node", "/opt/engine/dist/main.js"]
